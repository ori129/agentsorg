export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // new feature
        "fix",      // bug fix
        "docs",     // documentation only
        "style",    // formatting, no logic change
        "refactor", // code change that is neither fix nor feat
        "perf",     // performance improvement
        "test",     // adding or fixing tests
        "chore",    // build process, dependency updates, tooling
        "ci",       // CI/CD configuration
        "revert",   // reverts a previous commit
      ],
    ],
    "subject-case": [2, "always", "lower-case"],
    "header-max-length": [2, "always", 100],
  },
};
