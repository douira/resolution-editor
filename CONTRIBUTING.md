# Contributing to reolution-editor
We're really happy you'd like to contribute to this project! You can help us make this project nicer in a variaty of ways.

## How to contribute
Drop me (douira) a line if you are part of/affiliated with MUNOL or otherwise think you should have the right to directly contribute. You can also make a fork and create a pull request after having implemented the feature you really really want or fixed some bug or just helped out. Bug reports are possible through the editor itself. (it directs to the new issue page) You can also simply create an issue for this repo and we'll look into it.

Code style has to be adapted to the already used style and kept as consistent as possible.
Including but not limited to the following:
- Indent everything with 2 spaces
- Curly opening bracket right after closing round one (in functions)
- new features only on server side code (like arrow functions)
- use semicolons where possible
- name JS stuff and events in lowerCamelCase and pug IDs and classes with-hyphenation.
- JSON is also to be formatted appropriately (unless never looked at), use a online formatter if necessary
- Use JSHint with the given configuration file to validate your code before comitting (and remove all errors!)
- HoundCi checks that all pull requests comply with the linting rules
- JS version is ES5 on browser (so it's still mostly ok with IE10) and latest stable feature set in node.js (so without harmony flag) This will change when Materialize is updated to 1.0 and support for non-ES6 browsers will be dropped!
- enable bitwise operators and other special options per-file
- each js file must include a jsHint header to specify its use in browser or server

Typo fixes or small bugs are worthy of an issue too. So, if you find any bug that doesn't already have a issue, report it!

### How to file a bug
Make a screenshot of the bug as soon as it occurs. Also make screenshots of any subsequent variations on the bug if there are any. Please try to provide as much information as possible. These items are also on the new issue page when you get to it from the editor. Please provide all of these that apply:
- Operating System
- Device Type (handheld, desktop etc.)
- Browser + Version
- Browser Extensions that can modify website content
- What you were doing when the bug occured and beforehand?
- Were you able to reproduce the bug?
- Did the bug occur several times or in a recognisable pattern?
- Any other relevant information

This is how you take a screenshot on your OS: https://www.take-a-screenshot.org/
