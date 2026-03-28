# Feature Organization

## Core Principle

Organize by feature first, not by global type.

The app should grow by separating domains such as `auth`, `students`, `attendance`, `subjects`, `evaluations`, `schedules`, `payments`, `profile`, `notifications`, `settings`, and `theme`.

## Target Structure

```text
src/
|-- app/
|   |-- router/
|   |-- layouts/
|   |-- providers/
|   |-- store/
|   `-- bootstrap/
|-- assets/
|   |-- images/
|   |-- icons/
|   `-- styles/
|-- features/
|   |-- auth/
|   |   |-- pages/
|   |   |-- components/
|   |   |-- services/
|   |   |-- repositories/
|   |   |-- providers/
|   |   |-- store/
|   |   |-- hooks/
|   |   |-- schemas/
|   |   |-- utils/
|   |   |-- constants/
|   |   `-- types/
|   `-- ...
|-- shared/
|   |-- ui/
|   |-- components/
|   |-- hooks/
|   |-- lib/
|   |-- services/
|   |-- constants/
|   |-- types/
|   |-- utils/
|   |-- config/
|   |-- schemas/
|   `-- guards/
`-- docs/
    |-- architecture/
    `-- decisions/
```

## What Goes In `app/`

`app/` contains global wiring.

- `app/router`: routes, protected routes, route trees, and loaders when needed.
- `app/layouts`: global layouts such as dashboard, public, and auth layouts.
- `app/providers`: global React providers.
- `app/store`: truly cross-app state.
- `app/bootstrap`: initialization, session restore, and initial configuration.

## What Goes In `assets/`

Only static resources.

- images
- icons
- fonts
- global styles

Do not put logic here.

## What Goes Inside Each Feature

### `pages/`

- Feature screens.
- Compose UI and connect with `services`, `hooks`, and `store`.
- Should not hold heavy business logic.

### `components/`

- Reusable components within that feature.
- If a component serves multiple features, it should live in `shared/`.

### `services/`

- Business logic and orchestration.
- Coordinate providers, repositories, and store.
- Service-specific types should live in `types/`, not inside service files.

### `repositories/`

- Data access.
- Calls to Supabase, REST APIs, and remote or local persistence.
- Should not decide business flow.
- Repository-specific types should live in `types/`, not inside repository files.

### `providers/`

- SDKs or external integrations.
- Examples: Google Auth, Microsoft Auth, Stripe, Firebase.
- Provider-specific types should live in `types/`, not inside provider files.

### `store/`

- Feature state with Zustand or an equivalent tool.
- Cross-feature state must live in `app/store`.
- `store/` must not become a catch-all folder.
- Types belong in `types/`, constants in `constants/`, and pure helpers in `utils/`.
- The store should mainly expose state, setters, and feature actions.
- Store-specific types should live in `types/`, not inside store files.

### `hooks/`

- Feature-specific hooks.

### `schemas/`

- Validation schemas for forms or contracts.

### `utils/`

- Small, local utilities.
- Do not use this folder as a dumping ground.

### `constants/`

- Feature-specific constants.

### `types/`

- Feature types, DTOs, interfaces, and enums.
- Types should be defined in separate files whenever they do not share the same logic boundary.
- Do not keep feature types embedded inside `repository`, `service`, `provider`, or `store` files unless there is a strong and explicit reason.

## What Goes In `shared/`

Only pieces that are truly shared across multiple features.

- `shared/ui`: generic UI components.
- `shared/components`: more composed shared components.
- `shared/hooks`: hooks reusable across domains.
- `shared/lib`: base clients and technical wrappers.
- `shared/services`: truly cross-domain services.
- `shared/constants`: global constants.
- `shared/types`: shared types.
- `shared/utils`: generic helpers.
- `shared/config`: global configuration.
- `shared/schemas`: shared schemas.
- `shared/guards`: reusable guards.

## Rule For Future Changes

When creating or refactoring a feature, this organization should be the default.

If a folder is not needed yet, there is no need to create it empty, but the correct place for each concern must follow this map.
