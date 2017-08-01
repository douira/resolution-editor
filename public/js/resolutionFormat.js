/*jshint esnext: false, browser: false, jquery: false*/
/*global magicIdentifier: true*/

//validates an object (parsed json for example) with given format spec
//the format of the format is implied to be correct
function validateObjectStructure(obj, format) {
  //built-in type validators
  var typeValidators = {
    //basic types only need typeof
    string: function(val) {
      return typeof val === "string";
    },
    number: function(val) {
      return typeof val === "number";
    },
    boolean: function(val) {
      return typeof val === "boolean";
    },

    //object validation does all the work concerning attributes
    object: function(val, format) {

    }
  };

  //function that returns a function that validates an object with the given format
  function makeObjectFormatValidator(format) {
    return function(val) {
      return typeValidators.object(val, format);
    };
  }

  //add other types
  for (const typeName in format.types) {
    //register function that validates object with this format specifier
    typeValidators[typeName] = makeObjectFormatValidator(format.types[typeName]);
  }

  //return validation result of root object node
  return typeValidators.object(obj, format.structure);
}

//pattern of the resolution format - VERSION 1
//increment the version number if you make significant changes
var resolutionFileFormat = {
  types: {
    phraseClause: [
      {
        name: "phrase",
        type: "string",
        required: true
      },
      {
        name: "content",
        type: "string",
        required: true
      },
      {
        name: "sub",
        type: "array",
        required: false,
        minLength: 1,
        contentTypes: ["string", "phraselessClause"]
      },
      {
        name: "contentExt",
        type: "string",
        required: false,
        requiresField: "sub"
      }
    ],
    phraselessClause: [
      {
        name: "content",
        type: "string",
        required: true
      },
      {
        name: "sub",
        type: "array",
        required: false,
        minLength: 1,
        contentTypes: ["string", "phraselessClause"]
      },
      {
        name: "contentExt",
        type: "string",
        required: false,
        requiresField: "sub"
      }
    ]
  },
  structure: [
    {
      name: "magic",
      type: "string",
      value: magicIdentifier,
      required: true
    },
    {
      name: "version",
      type: "number",
      required: true
    },
    {
      name: "status",
      type: "object",
      required: true,
      content: [
        {
          name: "edited",
          type: "number",
          required: true
        },
        {
          name: "author",
          type: "string",
          required: true
        }
      ]
    },
    {
      name: "resolution",
      type: "object",
      required: true,
      content: [
        {
          name: "address",
          type: "object",
          required: true,
          content: [
            {
              name: "questionOf",
              type: "string",
              required: true
            },
            {
              name: "forum",
              type: "string",
              required: true
            },
            {
              name: "sponsor",
              type: "object",
              required: true,
              content: [
                {
                  name: "main",
                  type: "string",
                  required: true
                },
                {
                  name: "co",
                  type: "array",
                  required: true,
                  minLength: 1,
                  contentTypes: ["string"]
                }
              ]
            }
          ]
        },
        {
          name: "clauses",
          type: "object",
          required: true,
          content: [
            {
              name: "preambulatory",
              type: "array",
              required: true,
              minLength: 1,
              contentTypes: ["phraseClause"]
            },
            {
              name: "operative",
              type: "array",
              required: true,
              minLength: 1,
              contentTypes: ["phraseClause"]
            }
          ]
        }
      ]
    }
  ]
};
