#!/bin/bash

# Exit on error
set -e

# Name of the output zip file
ZIP_NAME="infinibot_extension.zip"

echo "Packaging InfiniBot extension for Chrome Web Store..."

# Remove previous build if it exists
if [ -f "$ZIP_NAME" ]; then
    echo "Removing older build..."
    rm "$ZIP_NAME"
fi

# Navigate to the extension directory
cd extension

# Zip the contents of the extension directory
# -r: recursive
# -q: quiet
# -9: maximum compression
zip -rq9 "../$ZIP_NAME" *

cd ..

echo "✅ Success! '$ZIP_NAME' has been created and is ready to be uploaded to the Chrome Web Store."
