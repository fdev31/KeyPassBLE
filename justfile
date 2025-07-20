# Default command, runs the app
default: run

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

# Show logs from the connected device
log:
    npx nativescript log android
