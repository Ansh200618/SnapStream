# SnapStream Apps

This directory contains standalone application versions of SnapStream.

## Available Apps

### SnapStream Desktop (`snapstream-app/`)

A full-featured desktop application with:
- **Inbuilt Browser**: Navigate the web without opening an external browser
- **Built-in Ad Blocker**: Powered by @cliqz/adblocker-electron (similar to uBlock Origin)
- **Image Detection & Download**: All the core SnapStream features
- **Cross-platform**: Works on Windows, macOS, and Linux

[View Full Documentation](./snapstream-app/README.md)

#### Quick Start

```bash
cd snapstream-app
npm install
npm start
```

## Building Apps

Each app can be built for distribution:

```bash
cd snapstream-app
npm run build          # Build for current platform
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:linux    # Linux
```

## Why Desktop Apps?

The desktop application offers several advantages over the browser extension:
- **No browser dependency**: Run without Chrome/Edge
- **Better ad blocking**: More powerful ad-blocking capabilities
- **Standalone experience**: Dedicated window and interface
- **More control**: Access to system-level features

## Contributing

Feel free to contribute new app variants or improvements to existing ones!
