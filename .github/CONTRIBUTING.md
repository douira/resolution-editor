# Contributing to resolution-editor
We're really happy you'd like to contribute to this project! You can help us make this project nicer in a variety of ways.

## How to contribute
Drop me (douira) a line if you are part of/affiliated with MUNOL or otherwise think you should have the right to directly contribute. You can also make a fork and create a pull request after adding a feature, fixing a bug or correcting a typo. Bug reports are encouraged through the editor itself. (with links that direct to the new issue page) You can also simply create an issue and we'll look into it.

Some conventions:  

- Indent using 2 spaces
- use semicolons where possible
- name JS identifiers and events in lowerCamelCase
- name pug IDs/classes with-hyphenation.
- JSON is also to be formatted appropriately, use a beautifier if necessary
- Use ESLint with the given configuration file to check your code before committing (and deal with all errors or warnings) `eslint .`
- ~~HoundCi checks that all pull requests comply with the linting rules~~ HoundCI is using an old eslint version. I'm waiting for TravisCI to migrate the repo to the new Checks API so we can use eslint there. (See note on Refactoring project)
- Using ES6 in browsers and a recent (non harmony-flag) node release
- client js files may have to declare globals imported from other files loaded or exported for other files. Even if an exported variable is used also used within the same file it should be declared as exported.

Typo fixes or small bugs are worthy of an issue too. So, if you find any bug that doesn't already have an issue, report it!

## How to file a bug
Make a screenshot of the bug as soon as it occurs. Also, make screenshots of any subsequent variations on the bug if there are any. Please try to provide as much helpful information as possible. See the template file or the filled in template text when you create a new issue. 

## Note on using git with this repo
Please run `git fetch -p` after having deleted a branch from a merged PR. This will actually delete the branch on the remote git servers instead of just "fake" deleting it.
Use `npm install` to resolve merge conflicts in package-lock.json if there are any. Npm will automatically detect and fix git merge conflicts.

## Tags
- The `bug` tag can be used on issues that describe a bug or on PRs that fix bugs.
- The `do not merge` tag may be added to a PR in order to show that the PR is still being worked on and should not be merged yet because it's a WIP.
- `user problem report` is for issues made by users of the editor