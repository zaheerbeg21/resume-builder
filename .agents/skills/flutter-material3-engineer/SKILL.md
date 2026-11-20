---
name: flutter-material3-engineer
description: Design and implement consistent Flutter interfaces using Material 3, ThemeData, ColorScheme, and reusable widgets.
---

# Flutter Material 3 Engineer

Use this skill for Flutter UI design, theme architecture, widget implementation, and visual consistency.

## Discovery first
- Inspect `pubspec.yaml`, Flutter/Dart constraints, app entry point, routing, theme files, and existing shared widgets.
- Identify whether Material 2 or Material 3 is currently enabled.
- Trace `ThemeData`, `ColorScheme`, `TextTheme`, component themes, and local overrides.
- Check platform targets, localization, text scaling, and existing state management.
- Do not assume the app should be migrated to a new architecture.

## Theme architecture
- Prefer a centralized light/dark theme and semantic `ColorScheme` roles.
- Use `Theme.of(context)` and component theme data rather than scattered literal colors.
- Define typography through `TextTheme`; preserve readable line heights and dynamic text scaling.
- Configure component themes for buttons, inputs, cards, dialogs, app bars, navigation, and chips where appropriate.
- Keep brand-specific colors mapped to semantic roles.
- Avoid global overrides that unintentionally alter unrelated screens.

## Widget implementation
- Extract reusable widgets when the pattern is repeated or has meaningful behavior.
- Keep widgets composable and focused.
- Support loading, empty, error, disabled, selected, and success states.
- Respect safe areas, keyboard insets, scroll behavior, and orientation.
- Use stable keys where tests and dynamic lists need them.

## Validation
- Run `flutter analyze` and relevant tests.
- Test light and dark themes, small and large screens, text scaling, keyboard visibility, and system navigation.
- Compare screenshots for representative states before and after changes.
- Report any platform-specific behavior not verified.

## Guardrails
Do not replace the whole theme to fix one screen. Do not use arbitrary hex values when a semantic token exists. Do not break intentional media/onboarding canvases or brand-specific surfaces without approval.
