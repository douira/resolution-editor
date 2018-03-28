# resolution-editor
[![Dependency Status](https://david-dm.org/douira/resolution-editor.svg)](https://david-dm.org/douira/resolution-editor)  
This editor guides the creation of a correctly formatted resolution document. It was created in need of a better way of formatting and distributing resolutions for MUNOL.
feel free to make a pull request if you have something you'd like to contribute to this project

## How to Install
The app can be downloaded by cloning the repo with
```
git clone https://github.com/douira/resolution-editor
``` 
Install the package after cloning the repo with
```
npm install
```
(I can try to help you to set this up if you run into problems unsolvable with google)  
You will also have to install the full distribution of (XeLa)TeX on your system. This is only required for rendering PDFs though. Pandoc used to be the interface between the renderer itslf and the server but the server handles moving the files and generating the latex code now, so pandoc and the accompanying npm package node-pandoc are not dependencies anymore. The server expects these binaries to be present and will crash otherwise. Start the server with
```
npm start
```
The server will then respond on the default node port. Open `http://localhost:3000` to use the client. Using the latest version of Node is usually recommended and will most likely work. (Features such as generator functions and arrow functions are used throughout the code.)

### Database Authentification
The mongoDB database start command in package.json uses the `--auth` flag which tells it to require connected clients to send credentials in order to be allowed to use the database. If you wish to use the editor without securing your database (because you're not deploying) just run the command in a seperate window/tab without the flag:
```
//start seperately (first)
mongod --port 27017 --dbpath data

//starts the server, database must be already running!
node ./bin/www
```

If you want to get rid of the warning about not having any access control on the database and/or are deploying this to a server where your database shouldn't be exposed without proper access control, create these users in the mongo shell:
```
use admin
db.createUser(
  {
    user: "adminUser",
    pwd: "xyz",
    roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
  }
)

//run this before the next command to auth and be able to add users
use admin
db.auth("adminUser", "xyz")

use resolution-editor
db.createUser(
  {
    user: "resolutionEditor",
    pwd: "zyx",
    roles: [ { role: "readWrite", db: "resolution-editor" } ]
  }
)
```
(You may have to enter these commands seperately.) Replace the `xyz` placeholders with the default passwords from `lib/credentials.js` or specify your own credentials a file in the same directory `lib/keys.json`. This file should not be committed and is ignored through .gitignore. The structure of the key file is the same as the object that specifies the default credentials. The server will read the specified credentials and use them to authenticate as `resolutionEditor` to the database.

## How to contribute
Thanks for wanting to contribute, that's great! All the info on how to contribute is in the [CONTRIBUTING file](https://github.com/douira/resolution-editor/edit/meta/CONTRIBUTING.md).

## Preview
Here are some previews of the editor as PDFs: (rendered on [this commit](https://github.com/douira/resolution-editor/commit/bafe125b2c8a7931f51447f0b91ae935ed67c862))
- [Editor Page](https://github.com/douira/resolution-editor/blob/readme-update/preview/Editor%20Page.pdf)
- [Front Page](https://github.com/douira/resolution-editor/blob/readme-update/preview/Front%20Page.pdf)
- [Help Page](https://github.com/douira/resolution-editor/blob/readme-update/preview/Help%20Page.pdf)
