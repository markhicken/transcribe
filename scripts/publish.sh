#!/bin/bash

# Publish script for transcribe-speech package

echo "🚀 Publishing transcribe-speech package..."

# Check if we're logged into npm
if ! npm whoami > /dev/null 2>&1; then
    echo "❌ Not logged into npm. Please run 'npm login' first."
    exit 1
fi

# Check if package name is available
echo "📦 Checking if package name is available..."
if npm view transcribe-speech > /dev/null 2>&1; then
    echo "❌ Package name 'transcribe-speech' is already taken."
    echo "   Please update the package name in package.json"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ You have uncommitted changes. Please commit or stash them first."
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