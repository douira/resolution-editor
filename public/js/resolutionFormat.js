/*jshint esnext: false, browser: false, jquery: false*/

//string used to identify files saved by this website (mild protection for now)
var magicIdentifier = "PG52QE1AM4LACMX9";

//debugging logger
/*function log(val) {
  console.log(val);
  return log;
}*/

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

    //object validation does all the work concerning object fields
    object: function(val, format) {
      //stop if not of type object
      if (typeof val !== "object") {
        return false;
      }

      //get present fields and their values
      var fields = Object.keys(val);
      fields = fields.map(function(key) {
        return {
          name: key,
          presentValue: val[key],
          present: true
        };
      });

      //add or expand with required and optional fields or values
      format.forEach(function(fieldSpec) {
        //try find matching element from present object
        var field = fields.find(function(presentField) {
          return presentField.name === fieldSpec.name;
        });

        //check if a present field was found
        if (! field) {
          //make new field with name
          field = {
            name: fieldSpec.name,
            present: false
          };

          //add created field to list
          fields.push(field);
        }

        //expand field entry
        field.content = fieldSpec.content;
        field.requiredType = fieldSpec.type;
        field.required = fieldSpec.required;

        //add value propertly if present in spec
        if (fieldSpec.hasOwnProperty("value")) {
          field.requiredValue = fieldSpec.value;
        }

        //add requiresField propertly if present in spec
        if (fieldSpec.hasOwnProperty("requiresField")) {
          field.requiresField = fieldSpec.requiresField;
        }
      });

      //check all fields to be ok
      return fields.every(function(field) {
        //check for fields that are present but not in the spec (requiredType must be a property)
        return field.hasOwnProperty("requiredType") &&

          //check for missing required fields
          (field.required ? field.present : true) &&

          //check for mismatching values (for primitives comparable with ===)
          (! field.hasOwnProperty("requiredValue") ||
            field.requiredValue === field.presentValue) &&

          //required fields are present
          (! field.hasOwnProperty("requiresField") ||
            fields.some(function(f) { return f.name === field.requiresField; })) &&

          //check for valid types with content if present
          (! field.present ||
            typeValidators[field.requiredType](field.presentValue, field.content));
      });
    },

    //array validation validates types of all indexes and length
    array: function(val, format) {
      //is of type array
      return (val instanceof Array) &&

        //minimum and maxmimum length is correct
        (! format.hasOwnProperty("minLength") || val.length >= format.minLength) &&
        (! format.hasOwnProperty("maxLength") || val.length <= format.maxLength) &&

        //only allowed types are used
        val.every(function(entry) {
          //valid as any of the allowed types (can't have content descriptor like object type)
          return format.contentTypes.some(function(type) {
            return typeValidators[type](entry);
          });
        });
    }
  };

  //function that returns a function that validates an object with the given format
  function makeObjectFormatValidator(format) {
    return function(val) {
      return typeValidators.object(val, format);
    };
  }

  //add other types
  for (var typeName in format.types) {
    //register function that validates object with this format specifier
    typeValidators[typeName] = makeObjectFormatValidator(format.types[typeName]);
  }

  //transform with intermediary function, uncomment for debugging (don't delete this)
  /*function makeTransformedValidator(validator, name) {
    return function(val, format) {
      var result = validator(val, format);
      return result;
    };
  }
  for (var name in typeValidators) {
    typeValidators[name] = makeTransformedValidator(typeValidators[name], name);
  }*/

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
        content: {
          minLength: 1,
          contentTypes: ["string", "phraselessClause"]
        }
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
        content: {
          minLength: 1,
          contentTypes: ["string", "phraselessClause"]
        }
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
                  content: {
                    minLength: 1,
                    contentTypes: ["string"]
                  }
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
              content: {
                minLength: 1,
                contentTypes: ["phraseClause"]
              }
            },
            {
              name: "operative",
              type: "array",
              required: true,
              content: {
                minLength: 1,
                contentTypes: ["phraseClause"]
              }
            }
          ]
        }
      ]
    }
  ]
};
