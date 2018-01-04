# Remove any boilerplate text that you aren't "replying to"/that doesn't apply to the issue you are submitting.

### Before you do anything
- Does the issue you are about to submit already exist in some form? (Maybe even as a PR) You can coment on related or very similar issues to discuss if your idea has already been discussed/submitted. Duplicate issues will be closed. Search the issues and PRs before submittign a new issue.
- Are you in the correct repository? The main Resolution Editor repo for MUNOL is douira/resolution-editor. If you want to say something about a fork or a similar project, please go there instead.
- Read `CONTRIBUTING.md` if you want to contribute

### Reporting a Problem as an end-user?

Please try to provide as much information as possible.
- Operating System
- Device Type (handheld, desktop etc.)
- Browser + Version
- Browser Extensions that can modify website content
- What you were doing when the bug occured and beforehand?
- Were you able to reproduce the bug?
- Did the bug occur several times or in a recognisable pattern?
- Any other relevant information

Please check before submitting an issue:
- [ ] Reloaded the page
- [ ] Reloaded the both the editor and the viewer if you are using LiveView
- [ ] You are running an up-to-date browser, check here: https://www.whatismybrowser.com/
- [ ] The browser supports JavaScript ES5 (and ES6 with an upcoming update) and WebSockets
- [ ] There isn't any firewall or proxy that is interfering

### Bug reports:
This is for advanced users that know a little about what is going on. ;-)
- A description of the issue
- The information as requested in the previous section as necessary
- Comntrast the expected and obversved behavior
- Include screenshots/video if necessary: This is how you take a screenshot on your OS: https://www.take-a-screenshot.org/
- Steps to reproduce
- All other relevant information and settings/the environment required to reproduce (e.g. detailed explanation, stacktraces, related issues, suggestions how to fix, links for us to have context, eg. stackoverflow, gitter, etc)
- If you are running the server yourself:
  - [ ] Restart server
  - [ ] Pull the latest version from this repo, maybe there is a branch that fixes this?
  - [ ] Update node.js
  - [ ] Update to the latest version of npm
  - [ ] Update packages to the latest/required version
  - [ ] Delete the database (updates may have changed the way the server looks at the stored data)
- Does the bug appear on other browsers too?
  
### Features:

**Please note by far the quickest way to get a new feature is to file a Pull Request.**

We will consider your request but it may be closed if it's something we're not actively planning to work on.
This list is similar to that in the pull request template:

- Description of the feature
- What good does it do?
- Can it be implememted without a huge amount of work, or will you do that work?
- Suggest implementation details if applicable/possible
- Reference relevant commits/issues/PRs
