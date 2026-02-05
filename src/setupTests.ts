// Setup file for Jest tests
// This ensures React is available globally for all tests

declare var global: any;

// Mock React globally before it's imported by html.js
global.React = require('react');
global.ReactDOM = require('react-dom');

// Mock the library imports to use node_modules versions
jest.mock('../lib/react-17.0.2.min.js', () => require('react'), { virtual: true });
jest.mock('../lib/react-dom-17.0.2.min.js', () => require('react-dom'), { virtual: true });
