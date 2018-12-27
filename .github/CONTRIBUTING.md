# Contributing to resolution-editor
We're really happy you'd like to contribute to this project! You can help us make this project nicer in a variety of ways.

## How to contribute
Drop me (douira) a line if you are part of/affiliated with MUNOL or otherwise think you should have the right to directly contribute.

You can make a fork and create a pull request after adding a feature, fixing a bug etc. If it's just a typo you can also just make an issue and I'll apply the change myself. Creating an issue is good too! Typos or small bugs are worthy of an issue too. So, if you find any bug that doesn't already have an issue, report it! (but please check that the issue really doesn't already exist)

### Some note on style:  
- Indent using 2 spaces
- Use semicolons where possible
- Name JS identifiers and events in lowerCamelCase
- Name pug IDs/classes with-hyphenation.
- JSON is also to be formatted appropriately, use a beautifier if necessary
- Use ESLint with the ESLint configuration file (which is a dev dependency) to check your code before committing (and deal with all errors or warnings) `eslint .`
- TracisCI does builds of PRs and runs ESLint and a few tests. (HoundCI used to do the linting directly but they don't support the config file setup we have here.)
- Use ES6 in browsers and a run in a recent (but without harmony-flag) node release
- Client js files may have to declare globals imported from other files loaded or exported for other files. Even if an exported variable is used also used within the same file it should be declared as exported.

## Using ESLint
This project uses a custom ESLint configuration. All commits should never violate these rules so that `eslint .` never returns any errors or warnings. In certain circumstances it might be necessary to exclude files (like libraries) or lines from linting. The custom rulset is `"eslint-config-douira": "github:douira/eslint-config-douira"` in the package file and should be automatically installed when you install this project with npm. The root `eslint.json` file in this project extends the custom ruleset. (by changing a rule to require semicolons because that's the style this project was started with)

## How to file a bug
Make a screenshot of the bug as soon as it occurs. Also, make screenshots of any subsequent variations on the bug if there are any. Please try to provide as much helpful information as possible such as browser console logs and/or server logs. See the template file or the filled in template text when you create a new issue. 

## Note on using git with this repo
Please run `git fetch -p` after having deleted a branch from a merged PR. This will actually delete the branch on the remote git servers instead of just "fake" deleting it.
Use `npm install` to resolve merge conflicts in package-lock.json if there are any. Npm should automatically detect and fix git merge conflicts.

## Tags
- The `bug` tag can be used on issues that describe a bug or on PRs that fix bugs.
- The `do not merge` tag may be added to a PR in order to show that the PR is still being worked on and should not be merged yet because it's a WIP.
- `user problem report` is for issues submitted by users of the editor client (not server operators, but users of the interface itself like conference participants)
