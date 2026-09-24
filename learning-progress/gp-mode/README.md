# GP Mode — Japanese Grammar Practice

Trigger phrase: **Go GP Mode**

## Start of each session
1. Read `data/jlpt-catalog.json` for the canonical JLPT grammar sequence.
2. Read the files in this directory for current progress and weak items.
3. Resume from the next unlearned grammar pattern; do not restart completed material.

## Normal learning day
1. Teach up to **20 new grammar patterns**, following the JLPT catalog order.
2. Complete teaching before testing.
3. Test the 20 learned patterns with **100 grammar questions**.
4. Give **20 particle questions**.
5. Give a separate **transitive/intransitive verb** practice section.
6. Record mistakes and weak areas.

## Weak review
- Grammar patterns and particle usages that show weakness are persisted in the progress files.
- Schedule weak material for review **3 days after it is marked weak**.
- A weak review tests at most **20 weak grammar patterns**, plus weak particle usages.
- A weak item is not removed merely because its review date arrived. Its later performance determines whether it remains weak.
- Track confusion pairs when useful (for example, one particle or grammar construction being confused with another).

## End of session
Update the progress files with:
- grammar learned/completed
- question performance
- weak grammar
- weak particle usages
- transitive/intransitive weaknesses
- next weak-review dates
- session/date information

The canonical grammar inventory remains `data/jlpt-catalog.json`; these files track the learner, not a second grammar catalog.
