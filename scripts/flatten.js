const fs = require('fs');
const path = require('path');

const remappings = {
    '@openzeppelin/contracts/': 'lib/openzeppelin-contracts/contracts/',
    'forge-std/': 'lib/forge-std/src/'
};

// Tracks which files have already been included to prevent duplicates
const includedFiles = new Set();

function resolveImportPath(importPath, currentFileDir) {
    // Check remappings first
    for (const [key, value] of Object.entries(remappings)) {
        if (importPath.startsWith(key)) {
            return path.resolve(value, importPath.slice(key.length));
        }
    }
    // Fall back to relative path
    return path.resolve(currentFileDir, importPath);
}

function flattenFile(filePath) {
    const absolutePath = path.resolve(filePath);
    if (includedFiles.has(absolutePath)) {
        return ''; // Already included
    }
    includedFiles.add(absolutePath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    const lines = content.split('\n');
    const fileDir = path.dirname(absolutePath);
    const resultLines = [];

    for (let line of lines) {
        const trimmed = line.trim();
        
        // Skip license and pragma lines (we will add them once at the top level)
        if (trimmed.startsWith('// SPDX-License-Identifier:') || trimmed.startsWith('pragma solidity')) {
            continue;
        }

        // Match imports: import "path"; or import { ... } from "path";
        const importMatch = trimmed.match(/import\s+(?:.*?from\s+)?["'](.*?)["']/);
        if (importMatch) {
            const importedPath = importMatch[1];
            const resolvedPath = resolveImportPath(importedPath, fileDir);
            console.log(`Processing import: ${importedPath} -> ${resolvedPath}`);
            const flattenedImport = flattenFile(resolvedPath);
            resultLines.push(flattenedImport);
        } else {
            resultLines.push(line);
        }
    }

    return resultLines.join('\n');
}

function processContract(inputPath, outputPath) {
    includedFiles.clear();
    console.log(`\n=== Flattening ${inputPath} ===`);
    
    const body = flattenFile(inputPath);
    
    // Add header
    const finalContent = [
        '// SPDX-License-Identifier: MIT',
        'pragma solidity ^0.8.20;',
        '',
        body
    ].join('\n');

    // Clean multiple consecutive empty lines
    const cleaned = finalContent.replace(/\n{3,}/g, '\n\n');

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, cleaned, 'utf8');
    console.log(`Saved flattened file to: ${outputPath}`);
}

// Flatten all contracts
try {
    processContract('src/ProtocolRegistry.sol', 'flat/ProtocolRegistry.sol');
    processContract('src/SlippageGuard.sol', 'flat/SlippageGuard.sol');
    processContract('src/ExecutionEngine.sol', 'flat/ExecutionEngine.sol');
    processContract('src/MockTarget.sol', 'flat/MockTarget.sol');
    console.log('\nAll contracts flattened successfully!');
} catch (err) {
    console.error('Error flattening contracts:', err);
    process.exit(1);
}
