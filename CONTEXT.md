# Quiz Battle

A real-time 1v1 multiplayer trivia battle application built with Next.js and Socket.io, powered by Open Trivia DB questions.

## Language

**Match**:
A live 1v1 competitive trivia game session between two players that ends when one player reaches 6 correct answers.
_Avoid_: Game, fight, duel, contest

**Room**:
An isolated real-time socket channel identified by a unique code where two players connect and play a Match.
_Avoid_: Lobby, channel, session, server

**Round**:
A single question cycle within a Match where both players are presented the same question simultaneously under an active countdown timer.
_Avoid_: Turn, question phase, tick

**Player**:
An authenticated user participating in a Match inside a Room.
_Avoid_: User, competitor, gamer, participant

**Question**:
A trivia prompt with one correct answer and multiple incorrect answers sourced from Open Trivia DB.
_Avoid_: Prompt, quiz, trivia item

**Answer**:
A player's submitted option choice for the active Question in the current Round.
_Avoid_: Response, choice, pick, guess

**Score**:
The count of correct Answers submitted by a Player during an active Match, progressing from 0 to 6.
_Avoid_: Points, health, meter, tally

**Rematch**:
A new Match initiated by players within the same Room immediately following the conclusion of a prior Match.
_Avoid_: Replay, retry, restart

