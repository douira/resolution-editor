/*jshint esversion: 6, node: true*/

//returns the correct punctuation for a given op clause context
function getOpPunctuation(subPresent, lastInClause, lastInDoc) {
  //essentially a precendence waterfall
  return lastInDoc ? "." : lastInClause ? ";" : subPresent ? ":" : ",";
}

//latex generator doesn't seem to be able to produce compilable code atm
module.exports = (obj) => {
  //add setup and some data
  let str = `
  \\newcommand{\\forum}{${obj.resolution.address.forum}}
  \\newcommand{\\issue}{${obj.resolution.address.questionOf}}
  \\newcommand{\\sponsor}{${obj.resolution.address.sponsor.main}}
  \\begin{tabbing}
      FORUM: \\quad \\quad  \\quad \\quad\\=\\forum \\\\
      \\\\
      QUESTION OF: \\>\\issue \\\\
      \\\\
      SPONSOR: \\>\\sponsor \\\\
  \\end{tabbing}
  \\MakeUppercase{THE \\forum},`;

  //preambs
  str += obj.resolution.clauses.preambulatory.map(
    (clause) => {
      //check if subclauses are going to be added
      const subsPresent = clause.sub && clause.sub.length;

      //add code for clause, add correct punctuation at and of content
      let str = `\\begin{preamb}{${clause.phrase}}{${
        clause.content + (subsPresent ? ":" : ",")}}\\end{preamb}`;

      //handle subclauses
      if (subsPresent) {
        //start subclauses
        str += "\\begin{preambsubclause}";
        str += clause.sub.map((sub) => `\\item ${sub},`).join("\n");
        str += "\\end{preambsubclause}";
      }

      //extensions not yet suppored by the template

      //return created clause
      return str;
    }
  ).join("\n");

  //ops
  if (obj.resolution.clauses.operative.length) {
    //begin operative clauses
    str += "\\begin{enumerate}[1., align = left, leftmargin =* , " +
      "widest* = 8, labelindent=0cm, labelsep=1cm, topsep=0pt]" +

    //for every oc clause
    obj.resolution.clauses.operative.map(clause => {
      //check if there are going to be subclauses
      const subsPresent = clause.sub && clause.sub.length;

      //clause beginning with correct punctuation
      let cStr = `\\begin{oc}{${clause.phrase}}{${clause.content + (subsPresent ? ":" : ";")}}`;

      //add subclauses, if detected
      if (subsPresent) {
        //begin of subclauses
        cStr += "\\begin{ocsubclause}";

        //for all subclauses add to string
        cStr += clause.sub.map(subclause => {
          //start with item
          let subContent = "\\item ";

          //if string only type
          if (typeof subclause === "string") {
            //only add string content, no deeper nesting possible
            subContent += subclause;
          } else {
            //check if subsubs are present
            const subsubsPresent = subclause.sub && subclause.sub.length;

            //add content with correct punctuation
            subContent += subclause.content + (subsubsPresent ? ":" : ",");

            //check for subclauses
            if (subsubsPresent) {
              //begin subsubclause
              subContent += "\\begin{ocsubsubclause}";

              //add all subclauses of this subclause
              subContent += subclause.sub.map(subsub =>
                //generate items
                "\\item " + (typeof subsub === "string" ? subsub : subsub.content)
              ).join("\n");

              //end sub segment
              subContent += "\\end{ocsubsubclause}";
            }
          }

          //return content of subclause
          return subContent;
        }).join("\n");

        //end subclauses
        cStr += "\\end{ocsubclause}";
      }

      //extensions not yet supported by the template

      //end clause and return
      return cStr + "\\end{oc}";
    }).join("\n") + "\\end{enumerate}";
  }
  console.log(str);
  return str;
};
