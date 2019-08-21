# Warning: This version is being superseded by a seperate project
Version 1 (this repo) of the Resolution Editor is being superseded by version 2 of the Resolution Editor. (The "_Next_" version) The new version is private for now. I'm not going to call this version _deprecated_ just yet but I'm not planing on investing any more time in it. The plan is to have it ready for the June 2020 MUNOL Conference but I'm not making any promises as this is quite an ambitious amount of work.

# resolution-editor

This editor guides the creation of a correctly formatted resolution document. It was created in need of a better way of formatting and distributing resolutions for MUNOL.
Feel free to make a pull request if you have something you'd like to contribute to this project. (If it's just a typo you can also just make an issue and I'll apply the change myself)

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

You will also have to install the full distribution of _XeLaTeX_ on your system. (Note: Adding `/Library/TeX/texlive` to your PATH may help after installing) This is only required for rendering PDFs though. The server handles moving files and generates latex code for documents. Pandoc is no longer a dependency. The server expects `xelatex` to be available on the command line and will crash otherwise. Start the server with

```
npm start
```

The server will then respond on the default node port. Open `http://localhost:3000` to use the client. Using the latest version of Node is usually recommended and will most likely work. (Features such as generator functions and arrow functions are used throughout the code.)
Please also look in the contributing info file for how to properly setup linting.

Install `npm-check-updates` with

```
npm i -g npm-check-updates
```

and run

```
ncu //for info
ncu -u
npm update
```

to check for major version updates. Check for compatability after `ncu` beforeusing it with `-u`.

### Database Authentication

The MongoDB database start command in package.json uses the `--auth` flag which tells it to require connected clients to send credentials in order to be allowed to use the database. If you wish to use the editor without securing your database (because you're not deploying) just run the command in a separate window/tab without the flag:

```
//start separately (first)
mongod --port 27017 --dbpath data

//starts the server, the database must be already running!
node ./bin/www
```

If you want to get rid of the warning about not having any access control on the database and/or are deploying this to a server where your database shouldn't be exposed without proper access control, create these users in the mongo shell:

```
use admin
db.createUser(
  {
    user: "adminUser",
    pwd: "xyz",
    roles: [
      { role: "userAdminAnyDatabase", db: "admin" },
      { role: "root", db: "admin" }
    ]
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
    roles: [{ role: "readWrite", db: "resolution-editor" }]
  }
)
```

(You may have to enter these commands separately.) Replace the `xyz` placeholders with the default passwords from `lib/credentials.js` or specify your own credentials a file in the same directory `resources/keys.json`. This file should not be committed and is ignored through .gitignore. The structure of the key file is the same as the object that specifies the default credentials. The server will read the specified credentials and use them to authenticate as `resolutionEditor` to the database.  
The database has to be updated as the binary version updates. See [the mongoDB docs](https://docs.mongodb.com/manual/release-notes/4.0-upgrade-standalone/) for more info. Use `db.adminCommand( { getParameter: 1, featureCompatibilityVersion: 1 } )` to get the current version of the data and `db.adminCommand( { setFeatureCompatibilityVersion: "4.0" } )` to change the version and upgrade the data. Do this in steps while updating the mongodb binary and checking the changelog.

Note that there also is a key for generating codes and tokens. This means that the server will reject codes and tokens if they don't match the current set of keys even though they might be present in the database. Codes and tokens are self-validating and the server checks them algorithmically before checking the database.

### Using PM2

We use the process manager PM2 to manage automatic running of the server and the database.

```
//to install pm2
npm install pm2 -g

//to initially load the app config
pm2 start ecosystem.config.js

//to start/stop/reload
pm2 start/stop/reload all

//to create a persistent service in the OS
pm2 startup

//then run the command it outputs to install
```

PM2 will change locations with nvm when node is updated; `pm2 startup` needs to be executed after every node update with nvm. See [The PM2 docs](http://pm2.keymetrics.io/docs/usage/startup/)

## How to contribute

Thanks for wanting to contribute, that's great! All the info on how to contribute is in the [CONTRIBUTING file](https://github.com/douira/resolution-editor/edit/meta/CONTRIBUTING.md).

## Preview

Here are PDF previews of some pages of the editor. Note that these are generated in `print` rendering mode so they _will_ look slightly distorted and different than the website when viewed normally in a browser.

- [Before New Resolution](https://github.com/douira/resolution-editor/blob/master/previews/Before%20New%20Resolution.pdf)
- [Editor with Example Resolution](https://github.com/douira/resolution-editor/blob/master/previews/Editor%20with%20Example%20Resolution.pdf)
- [Front Page](https://github.com/douira/resolution-editor/blob/master/previews/Front%20Page.pdf)
- [Help Page](https://github.com/douira/resolution-editor/blob/master/previews/Help%20Page.pdf)
- [Resolutions Overview](https://github.com/douira/resolution-editor/blob/master/previews/Resolutions%20Overview.pdf)
