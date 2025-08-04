# Keystore configuration for Android release builds
# IMPORTANT: For security, consider loading these from a private .env file
# by using `set dotenv-load` at the top of this file.
KEYSTORE_PATH := "keypass.jks"
KEYSTORE_PASSWORD := "password"
KEY_ALIAS := "keypass"
KEY_ALIAS_PASSWORD := "password"

# Default command, runs the app
default: run

# icon:
#     ./node_modules/.bin/tns resources generate icons /tmp/Untitled.png

check:
    npx tsc

test:
    npm test

# Setup the project for the first time or after a clean
setup:
    npm install
    npx nativescript prepare android
    chmod +x platforms/android/gradlew

# Build the Android application
build:
    npx nativescript build android

# Run the app on a connected Android device or emulator
run:
    npx nativescript run android

# Install the app (alias for run)
install: run

# Run the app in debug mode with Chrome DevTools
debug:
    npx nativescript debug android

# Clean the project build artifacts
clean:
    npx nativescript clean

# A more thorough clean, removing all generated files and dependencies
deep-clean:
    npx nativescript clean
    rm -rf node_modules
    rm -rf platforms
    rm -f package-lock.json

# Show logs from the connected device
log:
    npx nativescript log android

# Setup the project for iOS
setup-ios:
    npm install
    npx nativescript prepare ios

# Build the Android application in release mode
build-release:
    npx nativescript build android --release

# Run the Android application in release mode
run-release:
    npx nativescript run android --release

# Build the iOS application
build-ios:
    npx nativescript build ios

# Build the iOS application in release mode
build-ios-release:
    npx nativescript build ios --release

# Run the app on a connected iOS device or simulator
run-ios:
    npx nativescript run ios

# Run the iOS application in release mode
run-ios-release:
    npx nativescript run ios --release

# Run the app in debug mode with Safari Web Inspector
debug-ios:
    npx nativescript debug ios

# Show logs from the connected iOS device
log-ios:
    npx nativescript log ios

# Build a signed Android App Bundle for release
release:
    npx nativescript build android \
        --release \
        --apk \
        --key-store-path {{KEYSTORE_PATH}} \
        --key-store-password {{KEYSTORE_PASSWORD}} \
        --key-store-alias {{KEY_ALIAS}} \
        --key-store-alias-password {{KEY_ALIAS_PASSWORD}}
