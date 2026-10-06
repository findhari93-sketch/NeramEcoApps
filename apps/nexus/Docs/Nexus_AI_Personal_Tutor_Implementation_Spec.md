# Nexus AI Personal Tutor — Implementation Specification

## 1. Purpose

Build a **Personal AI Tutor** inside the Nexus student application.

The tutor must not behave like a generic ChatGPT clone or an answer generator. It should behave like a teacher who:

- understands the student's current knowledge;
- detects prerequisite gaps;
- adapts the teaching method to the student;
- teaches one concept at a time;
- asks the student questions instead of always giving answers;
- uses visual explanations when useful;
- verifies mathematics independently;
- evaluates the student's actual working, not only the final answer;
- gives personalized homework;
- finds similar questions automatically from the Nexus question bank;
- gradually increases difficulty;
- records mistakes and mastery;
- updates the student's learning profile;
- supports voice interaction;
- allows students to save useful explanations/formulas/visuals to My Learning.

The core principle is:

> **Same question does not mean same teaching path.**

---

# 2. Product Goal

Nexus should evolve from:

```text
Question Bank
+
AI Answer
```

into:

```text
Personal Learning System
+
Personal AI Teacher
```

The AI Teacher should continuously answer:

1. What does this student already know?
2. What prerequisite is missing?
3. What is the student's current mistake?
4. How does this student understand concepts best?
5. What should I teach next?
6. What question should the student practice next?
7. Is the student actually improving?
8. What should the student revise later?

---

# 3. Core Learning Loop

```text
QUESTION
   ↓
Understand Student
   ↓
Diagnose Prerequisites
   ↓
Choose Teaching Strategy
   ↓
Teach Concept
   ↓
Check Understanding
   ↓
Guided Attempt
   ↓
Independent Attempt
   ↓
Evaluate Working
   ↓
 ┌──────────────────────┐
 │                      │
Correct               Incorrect
 │                      │
 ↓                      ↓
Increase             Diagnose
Mastery               Root Error
 │                      ↓
 │                   Remediate
 │                      ↓
 │                    Retry
 └──────────┬───────────┘
            ↓
Find Similar Problem
            ↓
Variation / Extension
            ↓
Challenge
            ↓
Mastery
```

This loop must be persistent across sessions.

---

# 4. Personalization Philosophy

Do NOT permanently classify students as:

- visual learner;
- auditory learner;
- logical learner;
- slow learner;
- fast learner.

Instead maintain a **dynamic Learning State**.

The system should learn from actual interaction.

Example:

```text
Student Learning State

Mathematics
├── Algebra
│   └── Strong
├── Coordinate Geometry
│   └── Developing
├── Vectors
│   ├── Basic vector concept: Strong
│   ├── Vector addition: Developing
│   ├── Resultant: Weak
│   └── Dot product: Weak
└── Calculus
    └── Unknown
```

Teaching behaviour:

```text
Visual explanations        HIGH
Step-by-step explanations  HIGH
Socratic questioning       HIGH
Long explanations          LOW
Examples before formula    HIGH
Formula-first teaching     LOW
Independent attempts       HIGH
```

These values must be inferred and updated over time.

---

# 5. Student Learning Profile

Create a persistent student learning profile.

Suggested structure:

```ts
interface StudentLearningProfile {
  studentId: string;

  preferredLanguage: string;
  secondaryLanguages?: string[];

  mastery: MasteryRecord[];

  conceptStrengths: ConceptStrength[];
  conceptWeaknesses: ConceptWeakness[];

  commonMistakes: StudentMistake[];

  teachingPreferences: {
    visual: number;
    stepByStep: number;
    socratic: number;
    analogy: number;
    workedExample: number;
    practiceFirst: number;
    formulaFirst: number;
  };

  behaviour: {
    averageAttemptsBeforeHint: number;
    hintDependency: number;
    independentSuccessRate: number;
    correctionRate: number;
  };

  recentLearningHistory: LearningEvent[];

  currentGoals?: StudentGoal[];
}
```

Do not treat these values as permanent personality attributes.

They represent current evidence about what helps the student.

---

# 6. Concept Graph

Create a concept dependency graph.

Example:

```text
Motion
│
├── Position
│
├── Distance
│
├── Displacement
│
├── Speed
│
├── Velocity
│
└── Acceleration

Vectors
│
├── Scalar vs Vector
├── Vector Representation
├── Vector Addition
├── Components
├── Resultant
├── Dot Product
└── Angle Between Vectors
```

A complex question should map to the concepts required to solve it.

Example:

```text
Question:
"Two velocities act at an angle. Find resultant."

Required concepts:
- vector
- velocity
- vector addition
- magnitude
- angle
- cosine rule / vector magnitude
```

If the student fails because of vector addition, do not reteach velocity unless evidence shows that velocity is also weak.

---

# 7. Question Metadata

Every question in the question bank should eventually have structured metadata.

Suggested schema:

```ts
interface QuestionMetadata {
  questionId: string;

  subject: string;
  chapter: string;
  topic: string;

  difficulty: "easy" | "medium" | "hard" | "advanced";

  concepts: string[];
  prerequisites: string[];

  questionPattern?: string;
  requiredFormulas?: string[];

  commonMistakes?: string[];
  verifiedAnswer?: string;

  solutionSteps?: SolutionStep[];

  relatedQuestionIds?: string[];

  visualType?:
    | "geometry"
    | "vector"
    | "graph"
    | "physics"
    | "chemistry"
    | "none";
}
```

Do not depend on the LLM to rediscover this metadata every time.

Precompute and cache it.

---

# 8. AI Tutor Modes

The tutor should support several modes.

## 8.1 Teach Me

Student wants the concept explained.

Behaviour:

```text
Diagnose → Explain → Visualize → Check understanding
```

---

## 8.2 Solve With Me

The tutor should NOT immediately provide the complete solution.

Example:

```text
Teacher:
What do you think the first step should be?

Student:
Find the centroid.

Teacher:
Correct. What formula would you use?
```

---

## 8.3 Give Me a Hint

Hints should be progressive.

```text
Hint 1:
Think about the definition.

Hint 2:
What quantity is being averaged?

Hint 3:
Use the centroid coordinate formula.

Hint 4:
Here is the first substitution.
```

Avoid revealing the entire answer too early.

---

## 8.4 Explain the Answer

Show the complete verified solution.

---

## 8.5 Practice Me

Find a question with the appropriate difficulty.

---

## 8.6 Test Me

No unnecessary teaching.

The student attempts independently.

---

## 8.7 Diagnose Me

Ask targeted questions to determine the student's actual foundation.

---

# 9. Teaching Strategy Engine

The tutor should dynamically choose one or more teaching strategies.

Available strategies:

```text
SOCRATIC
DIRECT_EXPLANATION
VISUAL_EXPLANATION
ANALOGY
WORKED_EXAMPLE
COUNTER_EXAMPLE
STEP_BY_STEP
REVERSE_TEACHING
ERROR_BASED_REMEDIATION
PRACTICE
RECALL
```

Example:

```text
Student repeatedly asks "why?"

→ Prefer SOCRATIC + VISUAL + ANALOGY

Student is confident and answers quickly:

→ Prefer PRACTICE + CHALLENGE

Student repeatedly makes the same algebra error:

→ ERROR_BASED_REMEDIATION

Student forgot prerequisite:

→ DIRECT_EXPLANATION + SIMPLE_EXAMPLE
```

---

# 10. Teaching Interaction Rules

The tutor should follow these rules:

### Rule 1 — Do not over-explain automatically

Ask a small diagnostic question first.

### Rule 2 — One cognitive step at a time

Avoid dumping a complete chapter.

### Rule 3 — Ask the student to respond

Use active recall.

### Rule 4 — Detect confusion

If the student repeatedly fails:

```text
Same explanation
↓
Student still confused
↓
Change teaching strategy
```

### Rule 5 — Do not repeat the same explanation

Switch to:

- diagram;
- analogy;
- simpler example;
- physical interpretation;
- reverse explanation;
- practice.

### Rule 6 — Return to the original question

After teaching a prerequisite:

```text
Prerequisite lesson
↓
Micro-check
↓
Return to original question
```

---

# 11. Mathematical Verification

## Critical architecture rule

The LLM must NOT be the only mathematical authority.

Use:

```text
Student Question
      ↓
AI Tutor
      ↓
Math Solver / Verification Layer
      ↓
Verified Result
      ↓
AI Teacher Explanation
```

The LLM decides how to teach.

The verification layer verifies mathematics.

Possible technologies:

- symbolic algebra;
- deterministic formula evaluation;
- numerical verification;
- equation solvers;
- custom math validators;
- CAS integration where appropriate.

For geometry and vector problems, independently verify:

- coordinates;
- vector operations;
- magnitudes;
- angles;
- algebra;
- units;
- final answer.

---

# 12. Visual Teaching Engine

The tutor must support graphical teaching.

Do NOT generate every mathematical diagram as an AI image.

Prefer:

```text
SVG
+
Canvas
+
HTML
+
MathJax / KaTeX
```

This allows precise animation.

Example teaching plan:

```json
{
  "actions": [
    {
      "action": "draw_vector",
      "id": "v1",
      "from": [0, 0],
      "to": [4, 0]
    },
    {
      "action": "draw_vector",
      "id": "v2",
      "from": [0, 0],
      "to": [2, 3]
    },
    {
      "action": "translate_vector",
      "id": "v2",
      "to": [4, 0]
    },
    {
      "action": "draw_resultant",
      "from": [0, 0],
      "to": [6, 3]
    },
    {
      "action": "highlight",
      "target": "resultant"
    }
  ]
}
```

The frontend executes these actions deterministically.

The LLM should describe **what should be visualized**, not calculate pixel coordinates.

---

# 13. Voice Tutor

The voice experience should support:

```text
Student speaks
      ↓
Speech processing
      ↓
Tutor reasoning
      ↓
Teaching response
      ↓
Speech output
      ↓
Visual animation
```

The student must be able to interrupt.

Examples:

> "Wait."

> "Why?"

> "I don't understand."

> "Show me."

> "Give me a simpler example."

The tutor should respond conversationally.

Do not build continuous expensive voice processing for every interaction initially.

Use cost-controlled voice sessions.

---

# 14. Question Bank Similarity Engine

After a student solves a problem, the tutor should automatically find useful practice.

Classify candidate questions into:

### Level 1 — Very Similar

Same concept and same reasoning pattern.

### Level 2 — Variation

Same concept with different numbers/structure.

### Level 3 — Extension

Same concepts + one new concept.

### Level 4 — Challenge

Multiple concepts combined.

Example:

```text
Current question
      ↓
Question Bank Search
      ↓
Similarity ranking
      ↓
Prerequisite compatibility
      ↓
Difficulty compatibility
      ↓
Student mastery compatibility
      ↓
Recommended question
```

Student should not need to manually search.

---

# 15. Practice Recommendation

The tutor can say:

> "I found a question almost identical to this one."

or:

> "This one is similar, but it introduces one additional concept. I can teach that first, or you can try it."

Provide:

```text
[Practice Similar]
[Try Extension]
[Challenge Me]
[Give Me Homework]
[Browse Question Bank]
```

The student remains in control.

---

# 16. AI-Generated Homework

Homework should be generated from the student's current mastery state.

Example:

```text
Today's Personal Homework

1. Vector basics              🟢
2. Vector addition            🟢
3. Resultant                  🟡
4. Dot product                🔴
5. Mixed vector application   🔴
```

Homework should include a mixture of:

- reinforcement;
- weak concepts;
- previously incorrect concepts;
- spaced revision;
- one challenge question.

---

# 17. Handwritten Homework Evaluation

Student should be able to:

1. Solve on paper.
2. Photograph/scan the solution.
3. Upload it.
4. Ask AI Teacher to evaluate.

Evaluation must inspect the student's working.

Do NOT only compare final answers.

Suggested result:

```text
Homework Evaluation

Final Answer: ❌

Step 1: ✅
Step 2: ✅
Step 3: ❌
Step 4: ❌

Root Cause:
Direction of vector misunderstood.

Concept Status:
Vector direction → Needs remediation
```

Then:

```text
[Teach Me This]
[Try Similar Problem]
[Retry Original Problem]
```

---

# 18. Correct Homework Behaviour

When correct:

```text
🎉 Excellent!

You solved this independently.

+20 Mastery Points

Concept:
Vector Addition → Strong

Next recommended:
One slightly harder question.
```

Avoid meaningless praise.

Praise should identify what was done well.

Example:

> "Excellent. You chose the correct vector representation and handled the direction correctly."

---

# 19. Error Taxonomy

Track the root cause.

Suggested error types:

```text
CONCEPT_MISUNDERSTANDING
PREREQUISITE_GAP
FORMULA_RECALL
FORMULA_SELECTION
ALGEBRA_ERROR
ARITHMETIC_ERROR
SIGN_ERROR
UNIT_ERROR
DIRECTION_ERROR
GRAPH_READING_ERROR
QUESTION_INTERPRETATION
REASONING_GAP
CARELESS_ERROR
GUESS
INCOMPLETE_REASONING
```

Repeated errors should influence future teaching.

---

# 20. Mastery Model

Do not mark a concept mastered after one correct answer.

Use evidence.

Example:

```text
Concept: Vector Addition

Attempt 1 → Correct with hint
Attempt 2 → Correct
Attempt 3 → Wrong
Attempt 4 → Correct independently
Attempt 5 → Correct on harder question

Mastery = Strong
```

Suggested states:

```text
UNKNOWN
INTRODUCED
DEVELOPING
PRACTICING
STRONG
MASTERED
```

---

# 21. Points / Gamification

Reward learning behaviour, not only correct answers.

Example:

```text
Attempt homework               +5
Correct independently          +20
Correct after hint             +12
Correct after remediation      +8
Self-corrected mistake        +10
Mastered concept              +25
Completed revision            +5
```

Avoid creating a system where students are afraid to make mistakes.

Mistakes are learning signals.

---

# 22. My Learning / Knowledge Vault

Students should be able to save:

```text
Formula
Concept
Important Explanation
Mistake
Shortcut
Example
Diagram
AI Explanation
Bookmark
```

Example:

```text
My Learning

[All]
[Formulas]
[Concepts]
[Mistakes]
[Shortcuts]
[Diagrams]
[Important]
[Unmastered]
[Mastered]
```

Each saved item should retain context:

```text
Source Question
Subject
Chapter
Topic
Concept
Original Explanation
Student Note
Date Saved
Mastery Status
```

---

# 23. Active Recall from My Learning

My Learning should NOT become a passive bookmark folder.

The AI should convert saved items into revision.

Example:

Saved:

```text
Centre of sphere:
(-g, -f, -h)
```

Later the AI asks:

> "If the coefficient form contains +2gx, what is the x-coordinate of the centre?"

Student answers.

Then the tutor updates mastery.

---

# 24. Student-Controlled vs Teacher-Controlled Learning

Support both.

### Student-controlled

```text
Student:
"Find me another vector problem."
```

### Teacher-controlled

```text
AI:
"You made two mistakes with dot products.
I recommend these two questions."
```

### Hybrid

```text
AI:
"I recommend this question next.
Would you like to try it?"
```

The student must always be able to override the recommendation.

---

# 25. Session Memory

Within a session, retain:

```text
Current question
Current step
Current concept
Student responses
Hints already given
Misconceptions detected
Visual state
Teaching strategy
```

Do not repeatedly ask the same diagnostic question.

---

# 26. Long-Term Memory

Across sessions, retain structured learning data rather than dumping entire chat histories into every LLM request.

Example:

```json
{
  "studentId": "123",
  "topic": "vectors",
  "mastery": "developing",
  "weakConcepts": [
    "dot_product",
    "resultant_direction"
  ],
  "commonMistakes": [
    "direction_error"
  ],
  "effectiveStrategies": [
    "visual",
    "step_by_step"
  ]
}
```

This reduces token usage and improves personalization.

---

# 27. Cost-Control Architecture

Do not send every interaction to an expensive model.

Use routing.

```text
Student Request
      ↓
Intent Router
      ↓
 ┌────┼─────────────┐
 ↓    ↓             ↓
KB   Cheap LLM    Strong LLM
 ↓    ↓             ↓
Simple       Complex teaching
answer       / reasoning
```

Examples that may not require a strong LLM:

- formula lookup;
- chapter lookup;
- question metadata;
- question similarity;
- save note;
- simple definition;
- retrieving previous learning;
- selecting a question from structured metadata.

Use stronger models for:

- complex tutoring;
- ambiguous student reasoning;
- handwritten reasoning analysis;
- difficult prerequisite diagnosis;
- complex explanations.

---

# 28. Token Optimization

Never send the entire student history.

Instead send a compact learning state:

```json
{
  "topic": "vectors",
  "known": [
    "scalar_vs_vector",
    "displacement"
  ],
  "weak": [
    "vector_addition"
  ],
  "currentQuestion": "QUESTION_DATA",
  "currentStep": 2,
  "language": "English",
  "teachingPreferences": {
    "visual": 0.9,
    "stepByStep": 0.85,
    "socratic": 0.7
  }
}
```

Cache:

- question metadata;
- verified answers;
- common solutions;
- concept definitions;
- visual templates;
- related questions.

---

# 29. Model Abstraction

Do not tightly couple Nexus to one AI provider.

Create an internal interface:

```ts
interface TutorModel {
  generateTeachingResponse(
    context: TutorContext
  ): Promise<TutorResponse>;

  analyzeStudentWork(
    context: EvaluationContext
  ): Promise<EvaluationResult>;

  generatePractice(
    context: PracticeContext
  ): Promise<PracticeRecommendation>;
}
```

Possible implementations:

```text
OpenAIProvider
GeminiProvider
QwenProvider
DeepSeekProvider
LocalModelProvider
```

The Nexus tutor engine should not care which provider is being used.

---

# 30. Recommended Initial AI Strategy

Start with a hybrid architecture.

### Phase 1

Use a reliable hosted model to validate the product.

Focus on:

- tutoring;
- personalization;
- question matching;
- evaluation;
- mastery tracking.

### Phase 2

Measure:

```text
Cost per student
Tokens per session
Average tutoring turns
Homework evaluation cost
Voice usage
Model accuracy
Student completion
```

### Phase 3

Move suitable workloads to cheaper/small/open models.

Potential candidates to benchmark include:

- Qwen;
- DeepSeek;
- other suitable open-weight models.

Do not choose based only on benchmark scores.

Evaluate using real Nexus/JEE tasks.

---

# 31. Security

Never expose provider API keys in the browser.

Use:

```text
Nexus Web App
      ↓
Nexus Backend / Serverless API
      ↓
AI Provider
```

Use authentication and authorization.

The server should verify:

- student identity;
- question access;
- usage limits;
- rate limits;
- subscription/entitlement if applicable.

---

# 32. Suggested Nexus Components

Frontend:

```text
AITutorPanel
TutorMessage
TutorInput
VoiceButton
HintButton
TeachConceptButton
PracticeButton
HomeworkButton
SaveToLearningButton
VisualTeachingCanvas
StudentWorkUploader
EvaluationResult
MasteryIndicator
```

Backend:

```text
/tutor/session
/tutor/message
/tutor/hint
/tutor/practice
/tutor/evaluate
/tutor/homework
/tutor/recommend
/tutor/visual-plan
/tutor/mastery
/learning/save
/learning/review
```

Services:

```text
TutorOrchestrator
StudentProfileService
ConceptGraphService
QuestionSimilarityService
MathVerificationService
HomeworkEvaluationService
MasteryService
LearningVaultService
VisualPlanService
ModelRouter
```

---

# 33. Suggested Database Entities

Minimum:

```text
student_learning_profiles

concepts

concept_dependencies

question_metadata

student_mastery

student_mistakes

tutor_sessions

tutor_messages

learning_events

homework_assignments

homework_submissions

homework_evaluations

saved_learning_items

practice_recommendations
```

Do not create every table immediately if the current Supabase architecture can support JSONB safely. Start with normalized structures for data that must be queried frequently.

---

# 34. Event Tracking

Record important learning events.

Examples:

```text
QUESTION_OPENED
TUTOR_STARTED
PREREQUISITE_DETECTED
CONCEPT_TAUGHT
HINT_REQUESTED
ANSWER_ATTEMPTED
ANSWER_CORRECT
ANSWER_WRONG
MISTAKE_DETECTED
REMEDIATION_STARTED
REMEDIATION_COMPLETED
HOMEWORK_ASSIGNED
HOMEWORK_SUBMITTED
HOMEWORK_EVALUATED
CONCEPT_MASTERED
QUESTION_RECOMMENDED
QUESTION_COMPLETED
LEARNING_ITEM_SAVED
VOICE_SESSION_STARTED
```

These events will power analytics and personalization.

---

# 35. Example: Personalization Based on Today's Learning

Suppose a student asks:

> "Why does the resultant velocity look like a triangle?"

Tutor should detect:

```text
Question:
Vector addition

Observed confusion:
Geometric interpretation

Likely weak concept:
Head-to-tail vector addition

Recommended strategy:
Visual + physical analogy
```

Then:

```text
Draw v1
↓
Move v2 to head of v1
↓
Animate resultant
↓
Explain "start → finish"
↓
Ask student:
"Which arrow represents the total effect?"
```

Then return to the original problem.

---

# 36. Example: Another Student

If another student says:

> "I know vector addition. Give me the formula."

Do not force the visual lesson.

Answer briefly and test them.

The tutor should adapt.

---

# 37. Definition of Success

The AI Tutor is successful when:

```text
Student enters with:
"I don't understand."

        ↓

Tutor discovers:
"What exactly don't you understand?"

        ↓

Tutor teaches:
"Here's the missing foundation."

        ↓

Student attempts:
"I can solve it."

        ↓

Tutor verifies:
"Your reasoning is correct."

        ↓

Tutor recommends:
"Here's your next appropriate problem."

        ↓

Student improves:
"I can now solve harder problems independently."
```

The objective is **student independence**, not maximum AI interaction.

---

# 38. MVP Scope

Do NOT build everything simultaneously.

## MVP 1

Implement:

- Ask AI Tutor from a question;
- structured question context;
- text tutoring;
- prerequisite diagnosis;
- Socratic mode;
- hints;
- verified solution;
- similar question recommendation;
- student mastery;
- Save to My Learning.

## MVP 2

Add:

- homework;
- handwritten upload;
- step-by-step evaluation;
- mistake taxonomy;
- targeted remediation;
- personalized practice.

## MVP 3

Add:

- visual teaching canvas;
- animated diagrams;
- graphs;
- vector visualization;
- geometry visualization.

## MVP 4

Add:

- voice interaction;
- interruption;
- voice + visual synchronization.

## MVP 5

Add:

- model routing;
- open-weight/self-hosted models;
- cost optimization;
- advanced personalization.

---

# 39. Golden Product Rule

Every implementation decision should follow this rule:

> **The AI is not the teacher's brain. The Nexus learning system is the teacher's brain; AI models are interchangeable reasoning and language engines inside it.**

Therefore:

```text
Student Model
+
Concept Graph
+
Question Graph
+
Math Verification
+
Teaching Strategy
+
Visual Engine
+
Mastery Engine
+
Homework Evaluation
+
AI Model
=
Nexus Personal AI Teacher
```

---

# 40. First Implementation Task for Claude

When implementing this specification, do NOT attempt the entire system in one pass.

Start by inspecting the existing Nexus monorepo and identify:

1. Student application.
2. Admin application.
3. Shared packages.
4. Existing authentication.
5. Existing question-bank schema.
6. Existing Supabase schema.
7. Existing API/serverless functions.
8. Existing analytics/event infrastructure.
9. Existing UI component library.
10. Existing environment variable conventions.

Then produce an implementation plan based on the existing architecture.

Do not rewrite working infrastructure unnecessarily.

Before changing database schemas, identify existing tables and JSON structures and propose migrations.

Before integrating an AI provider, create a provider abstraction.

Before implementing visual generation, create a deterministic visual-plan schema.

Before implementing homework evaluation, create an evaluation result schema.

---

# 41. Non-Negotiable Principles

1. **Never blindly trust an LLM for mathematics.**
2. **Never give the same teaching path to every student.**
3. **Do not reveal complete solutions too early.**
4. **Prefer active learning over passive explanation.**
5. **Diagnose prerequisite gaps.**
6. **Evaluate working, not only final answers.**
7. **Track root mistakes.**
8. **Return to the original problem after remediation.**
9. **Use question-bank metadata to reduce AI cost.**
10. **Use model routing to reduce token usage.**
11. **Keep AI provider replaceable.**
12. **Use deterministic rendering for mathematical diagrams.**
13. **Keep the student in control of recommendations.**
14. **Use mistakes as learning data.**
15. **Optimize for independent student mastery, not AI engagement.**

---

# 42. Final Vision

Nexus should eventually feel like this:

> **"My teacher knows what I understand, what I forgot, why I made my last mistake, how I understand things best, and what I should learn next."**

A student should be able to open any question and say:

> **"Teach me this."**

And Nexus should be able to respond:

> **"Before we start, I noticed you haven't mastered one of the concepts needed for this problem. Let's fix that first."**

Then:

> **"Now you try."**

Then:

> **"Good. You're ready for a similar problem."**

Then:

> **"You made the same sign mistake again. Let's fix the underlying concept."**

Then:

> **"Now solve this one independently."**

That is the target experience for the **Nexus Personal AI Teacher**.
