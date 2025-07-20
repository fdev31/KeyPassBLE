# Default command, runs the app
default: run

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