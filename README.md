# resolution-editor
This editor guides the creation of a correctly formatted resolution document. It was created in need of a better way of formatting and distributing resolutions for MUNOL.
feel free to make a pull request if you have something you'd like to contribute to this project

## How to Install
The app is a npm package and an be downloaded by cloning the repo with
```
git clone https://github.com/douira/resolution-editor
``` 
Install the package after cloning the repo with
```
npm install
```
(I can try to help you to set this up if you run into problems unsolvable with google)  
You will also have to install the full distributions of LaTeX and pandoc on your system. These are only required for rendering PDFs though. The server expects these binaries to be present and will crash otherwise. Start the server with
```
npm start
```
The server will then respond on the default node port. Open `http://localhost:3000` to use the client.

## How to contribute
Drop me (douira) a line if you are part of/affiliated with MUNOL or otherwise think you should have the right to directly contribute. You can also make a fork and create a pull request after having implemented the feature you really really want or gfixed some bug or just helped out. Bug reports are possible through the editor itself. (it directs to the new issue page) You can also simply create an issue for this repo and we'll look into it.

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
- JS version is ES5 on browser (so it's still mostly ok with IE10) and ES6 for node.js (so without harmony flag)
- enable bitwise operators and other special options per-file
- each js file must include a jsHint header to specify its use in browser or server

Typo fixes or small bugs are worthy of an issue too. So, if you find any bug that doesn't already have a issue, report it!

### How to file a bug
Make a screenshot of the bug as soon as it occurs. Also make screenshots of any subsequent variations on the bug if there are any. Please try to provide as much information as possible:
- Operating System
- Device Type (handheld, desktop etc.)
- Browser + Version
- Browser Extensions that can modify website content
- What you were doing when the bug occured and beforehand?
- Were you able to reproduce the bug?
- Did the bug occur several times or in a recognisable pattern?
- Any other relevant information

This is how you take a screenshot on your OS: https://www.take-a-screenshot.org/

## Screenshots
Here are some screenshots if you don't want to/can't get the repo to run on your machine: (from 26 Jun 2017)

![Images of the Website: header and general data](http://i.imgur.com/3ZbJGfb.png)
![Images of the Website: preamb clauses](http://i.imgur.com/0OSc8g1.png)
![Images of the Website: op clauses with sublcauses and eab](http://i.imgur.com/ah6KhDi.png)
![Images of the Website: footer](http://i.imgur.com/mAjybQL.png)
