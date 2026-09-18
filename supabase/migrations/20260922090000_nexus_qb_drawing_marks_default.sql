-- Drawing questions are worth 50 marks.
--
-- Every drawing question in the bank had a NULL drawing_marks, which is why the
-- student practice panel never printed "Worth N marks" and the Copy prompt sent
-- to Gemini carried no MARKS line. The paper's own scheme has always been 50 for
-- a drawing (paper-marking.ts SCHEME drawing [50, 0]), so the column was holding
-- a blank for a number nobody disputes.
--
-- Two parts: fill in what is already there, and stop new rows arriving blank.

update nexus_qb_questions
   set drawing_marks = 50
 where question_format = 'DRAWING_PROMPT'
   and drawing_marks is null;

-- A column DEFAULT would stamp 50 on every MCQ too, so the default is applied
-- by format. INSERT only, deliberately: a teacher who clears the marks on a
-- paper that says something else must not be overruled on the next save.
create or replace function nexus_qb_default_drawing_marks()
returns trigger
language plpgsql
as $$
begin
  if new.question_format = 'DRAWING_PROMPT' and new.drawing_marks is null then
    new.drawing_marks := 50;
  end if;
  return new;
end;
$$;

drop trigger if exists nexus_qb_default_drawing_marks_ins on nexus_qb_questions;

create trigger nexus_qb_default_drawing_marks_ins
  before insert on nexus_qb_questions
  for each row
  execute function nexus_qb_default_drawing_marks();
