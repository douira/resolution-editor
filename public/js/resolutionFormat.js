/*global module */

//string used to identify files saved by this website, mild effect
const magicIdentifier = "PG52QE1AM4LACMX9";

//debugging logger
/*function log(val) {
  console.log(val);
  return log;
}*/

//pattern of the resolution format - VERSION 2 (?)
/*File format version history: (incremented when compatibility changes or with large differences)
1: start
2: typo fix (from edited to edited)
3: typo fix (from form to forum)
6: removed clauses of just strings, must always be objects
*/
const resolutionFileFormat = {
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
          contentTypes: ["phraselessClause"]
        }
      },
      {
        name: "contentExt",
        type: "string",
        required: false,
        requiresField: "sub" //require S Field is correct spelling, the field sub is required
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
          contentTypes: ["phraselessClause"]
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
      name: "author",
      type: "string",
      required: true
    },
    {
      name: "voteResults",
      type: "object",
      required: false,
      content: [
        {
          name: "inFavor",
          type: "number",
          required: true
        },
        {
          name: "against",
          type: "number",
          required: true
        },
        {
          name: "abstention",
          type: "number",
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

//validates an object (parsed json for example) with given format spec
//the format of the format is implied to be correct
const validateObjectStructure = (obj, format) => {
  //fall back to default format if none given
  if (typeof format === "undefined") {
    format = resolutionFileFormat;
  }

  //built-in type validators
  const typeValidators = {
    //basic types only need typeof
    string: val => typeof val === "string",
    number: val => typeof val === "number",
    boolean: val => typeof val === "boolean",

    //object validation does all the work concerning object fields
    object: (val, format) => {
      //stop if not of type object
      if (typeof val !== "object") {
        return false;
      }

      //get present fields and their values
      const fields = Object.keys(val).map(key => ({
        name: key,
        presentValue: val[key],
        present: true
      }));

      //add or expand with required and optional fields or values
      format.forEach(fieldSpec => {
        //try find matching element from present object
        let field = fields.find(presentField => presentField.name === fieldSpec.name);

        //check if a present field was found
        if (! field) {
          //make a new field with a name
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
        if ("value" in fieldSpec) {
          field.requiredValue = fieldSpec.value;
        }

        //add requiresField propertly if present in spec
        if ("requiresField" in fieldSpec) {
          field.requiresField = fieldSpec.requiresField;
        }
      });

      //check all fields to be ok
      return fields.every(field =>
        //check for fields that are present but not in the spec (requiredType must be a property)
        "requiredType" in field &&

          //check for missing required fields
          (field.required ? field.present : true) &&

          //check for mismatching values (for primitives comparable with ===)
          (! ("requiredValue" in field) ||
            field.requiredValue === field.presentValue) &&

          //required fields are present
          (! ("requiresField" in field) ||
            fields.some(f => f.name === field.requiresField)) &&

          //check for valid types with content if present
          (! field.present ||
            typeValidators[field.requiredType](field.presentValue, field.content))
      );
    },

    //array validation validates types of all indexes and length
    array: (val, format) =>
      //is of type array
      val instanceof Array &&

        //minimum and maxmimum length is correct
        (! format.hasOwnProperty("minLength") || val.length >= format.minLength) &&
        (! format.hasOwnProperty("maxLength") || val.length <= format.maxLength) &&

        //only allowed types are used
        val.every(entry =>
          //valid as any of the allowed types (can't have content descriptor like object type)
          format.contentTypes.some(type => typeValidators[type](entry))
        )
  };

  //function that returns a function that validates an object with the given format
  const makeObjectFormatValidator = format => val => typeValidators.object(val, format);

  //add other types
  for (const typeName in format.types) {
    //register function that validates object with this format specifier
    typeValidators[typeName] = makeObjectFormatValidator(format.types[typeName]);
  }

  //transform with intermediary function, uncomment for debugging (don't delete this)
  /*function makeTransformedValidator(validator, name) {
    return function(val, format) {
      var result = validator(val, format);
      console.log(result, val, format);
      return result;
    };
  }
  for (var name in typeValidators) {
    typeValidators[name] = makeTransformedValidator(typeValidators[name], name);
  }*/

  //return validation result of root object node
  return typeValidators.object(obj, format.structure);
};

//create object to export
const resolutionFormat = {
  check: validateObjectStructure,
  magicIdentifier,
  resolutionFileFormat
};

//extra nodejs module exporting
if (typeof module === "object") {
  module.exports = resolutionFormat;
}
