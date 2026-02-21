const marked = require('marked');
const text = "# Heading 1\nSome text here\n## Heading 2\nMore text here\n### Heading 3\nEven more text";
console.log(marked.parse(text));
