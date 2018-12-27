const { expect } = require("chai");
const tokenProcessor = require("../lib/token");
const credentials = require("../lib/credentials");

describe("token processor", () => {
  describe("generation", () => {
    it("should generate a valid token/code", () => {
      //make a token to inspect
      const token = tokenProcessor.makeToken();

      //validate token form
      expect(token).to.be.a("string");
      expect(token).to.match(/@[BCDGHJKLMNPQRSTVWXYZ123456789]{8}/);

      //make a code to inspect
      const code = tokenProcessor.makeCode();

      //validate
      expect(code).to.be.a("string");
      expect(code).to.match(/![BCDGHJKLMNPQRSTVWXYZ123456789]{8}/);
    });

    it("should not generate the same content", function() {
      //retry in the unlikely event that it randomly generates the same token twice
      this.retries(5);

      //should not equal two times
      expect(tokenProcessor.makeToken()).to.not.equal(tokenProcessor.makeToken());
    });

    it("should not generate the same character twice in succession", () => {
      //run many times to verify with enough confidence
      for (let i = 0; i < 1000; i ++) {
        //validate that it has no same character twice in succession
        expect(tokenProcessor.makeToken()).to.not.match(/(.)\1+/);
      }
    });
  });

  describe("validation", () => {
    it("should generate the same validation string for the same input", () => {
      //should stay the same
      let seed;
      for (let i = 0; i < 10; i ++) {
        seed = Math.random().toString();
        expect(tokenProcessor.getValidation(seed, 5))
          .to.equal(tokenProcessor.getValidation(seed, 5));
      }
    });

    it("should generate different validation strings for different inputs", function() {
      //retry if randomly matched
      this.retries(5);

      //should be different
      expect(tokenProcessor.getValidation(Math.random().toString(), 5))
        .to.not.equal(tokenProcessor.getValidation(Math.random().toString(), 5));
    });

    it("should invalidate bad syntax token", () => {
      expect(tokenProcessor.check()).to.be.false;
      expect(tokenProcessor.check("")).to.be.false;
      expect(tokenProcessor.check("hgfhgfd")).to.be.false;
    });

    it("should validate a lower case token", () => {
      expect(tokenProcessor.check(tokenProcessor.makeToken().toLowerCase())).to.be.true;
    });

    it("should recognise a valid token as valid", () => {
      expect(tokenProcessor.check(tokenProcessor.makeToken())).to.be.true;
    });
  });

  describe("key hashed validation", function() {
    let cred;
    before("copy real credentials out", () => {
      cred = {
        tokenSeed: credentials.tokenSeed,
        tokenSuffix: credentials.tokenSuffix
      };
    });

    //retry on random collision
    this.retries(5);

    it("should invalidate a token from a different tokenSeed", () => {
      //change seed and expect it to be invalidated
      credentials.tokenSeed = 1145436668;
      const token = tokenProcessor.makeToken();
      credentials.tokenSeed = 1355465746;
      expect(tokenProcessor.check(token)).to.be.false;
    });

    it("should invalidate a token from a different tokenSuffix", () => {
      credentials.tokenSuffix = "glfdkgGSGDF765kflgklödgkföd";
      const token = tokenProcessor.makeToken();
      credentials.tokenSeed = "1355dsfdsfsdFDSFSfdss465746";
      expect(tokenProcessor.check(token)).to.be.false;
    });

    after("restore credentials", () => {
      credentials.tokenSeed = cred.tokenSeed;
      credentials.tokenSuffix = cred.tokenSuffix;
    });
  });
});
