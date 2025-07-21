#!/bin/bash

# Publish script for transcribe-speech package

echo "🚀 Publishing transcribe-speech package..."

# Check if we're logged into npm
if ! npm whoami > /dev/null 2>&1; then
    echo "❌ Not logged into npm. Please run 'npm login' first."
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Prompt user for confirmation
echo "📋 About to publish transcribe-speech package:"
echo "   - This will increment the patch version"
echo "   - Package will be published to npm registry"
echo "   - Users will be able to install with: npm install transcribe-speech"
echo ""
read -p "🤔 Are you sure you want to proceed? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Release cancelled by user"
    exit 1
fi

# Build and publish
echo "📤 Publishing to npm..."
npm version patch
npm publish

if [ $? -eq 0 ]; then
    echo "✅ Successfully published transcribe-speech!"
    echo "🎉 Users can now run: npx transcribe-speech path/to/audio.mp3"
else
    echo "❌ Failed to publish package"
    exit 1
fi 