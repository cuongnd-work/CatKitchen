# Repository Guidelines

## Project Structure & Module Organization
PlayableTemplate targets Cocos Creator 3.8.7. Source assets live in `assets/`: `scripts/` stores TypeScript components, `prefabs/` houses reusable nodes, and `resources/` contains runtime data. Framework utilities (signal bus, lifecycle, object pool) reside under `assets/plugins/game-foundation`. HTML tooling for bundling lives in `assets/plugins/super-html`. Editor-only code for the Super HTML exporter is in `extensions/super-html`, which compiles to `dist/`. Generated artifacts (`build/`, `library/`, `temp/`, and `profiles/`) are cache/output directories; avoid manual edits and keep them out of commits.

## Build, Test, and Development Commands
Open the project with Cocos Creator 3.8.7 (`CocosCreator --project .`). Use the build task to produce a playable bundle: `CocosCreator --project . --build "platform=html5;debug=false"`, which writes to `build/web-mobile`. While iterating on the Super HTML exporter, run `cd extensions/super-html && npm install` once, then `npx tsc -b` for a production compile or `npx tsc -w` to watch. Launch the in-editor simulator (`Ctrl+P` / `Cmd+P`) for quick runtime checks before exporting.

## Coding Style & Naming Conventions
All gameplay code is TypeScript with 4-space indentation and semicolons. Declare Cocos components with `@ccclass` using PascalCase (e.g., `GameInit`), and prefer camelCase for methods and properties. Keep assets addressable via `db://` aliases; mirror the folder hierarchy when adding new modules to `assets/plugins`. Run `npx tsc -b` in any directory that owns a `tsconfig.json` before submitting.

## Testing Guidelines
Feature tests happen inside the Creator simulator or the exported HTML5 bundle. Provide an HTML build (`build/web-mobile`) when validating gameplay changes, and capture console output for systems such as the signal bus or object pool. Name exploratory scripts `test*.ts` only while experimenting; rename to the target feature before merging. Document manual test steps in the PR to make regression checks repeatable.

## Commit & Pull Request Guidelines
Existing history uses short, imperative commits such as `Implement signal bus system`; follow that format and scope each change narrowly. Reference relevant scenes or prefabs in the body when they change. Pull requests should summarise the feature, list affected directories, and link tracking tasks. Include screenshots or short clips when UI or Playable behaviour changes, and attach the generated HTML bundle whenever feasible.
