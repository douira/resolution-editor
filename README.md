# resolution-editor
[![Dependency Status](https://david-dm.org/douira/resolution-editor.svg)](https://david-dm.org/douira/resolution-editor)  
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
Thanks for wanting to contribute, that's great! All the info on how to contribute is in the [CONTRIBUTING file](https://github.com/douira/resolution-editor/edit/meta/README.md).

## Screenshots
Here are some screenshots if you don't want to/can't get the repo to run on your machine: (from 26 Jun 2017)

![Images of the Website: header and general data](http://i.imgur.com/3ZbJGfb.png)
![Images of the Website: preamb clauses](http://i.imgur.com/0OSc8g1.png)
![Images of the Website: op clauses with sublcauses and eab](http://i.imgur.com/ah6KhDi.png)
![Images of the Website: footer](http://i.imgur.com/mAjybQL.png)
