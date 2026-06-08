# PM Tool

Desktop app for managing projects, teams, and resources. Built with Electron, React, TypeScript, Ant Design and SQLite. Multiple users can share one `.db` file stored on a network drive.

## Download

Clone the repository:

```bash
git clone <repository-url>
cd pm-tool
```

## Install dependencies

Requires [Node.js](https://nodejs.org/) (18+) and npm.

```bash
npm install
```

## Run in development mode

```bash
npm start
```

This launches the app with hot reload and DevTools open.

## Build a Windows installer

```bash
npm run make
```

The packaged `.exe` installer will be generated under `out/make/`.

## Sharing data between users

Point every user's app at the same shared `.db` file via **Config → Settings → DB Path**, so everyone works off the same data.
