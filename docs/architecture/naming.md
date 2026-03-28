# Naming

## Rules

- All code naming must be in English.
- Variables, functions, classes, components, types, directories, files, and any other programming identifiers must be in English.
- User-facing string values may be in Spanish when they are part of the product experience.
- Directories and files must use kebab-case: `a-b`.
- Variables must be in English and use `camelCase`.
- Functions must be in English and use `camelCase`.
- Components, types, interfaces, and classes must be in English and use `PascalCase`.
- Constants must use `SCREAMING_SNAKE_CASE`.
- Use `repositories`, never `repo`.
- Use `providers`, never ambiguous aliases.
- Directories must use complete and descriptive names.
- Persistence files must use the `.repository.ts` suffix.
- External integration files must use the `.provider.ts` suffix.
- Orchestration files must use the `.service.ts` suffix.
- Zustand stores must live in `store/`.
- Types must live in the `types/` directory, not inside `repository`, `service`, `provider`, or `store` files.
- Types should use separate files unless they clearly belong to the same shared logic boundary.
