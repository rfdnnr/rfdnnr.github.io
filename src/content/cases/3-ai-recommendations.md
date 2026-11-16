---
order: 3
slug: ai-recommendations
label: AI recommendations
stmt: 500+ recommendations since launch. And counting.
sub: Turned random picks into real recommendations · I designed the harness
---

### What I wanted

Scentia recommends perfumes in two ways: for a purchase, and for an occasion. A language model is good at explaining a choice, but left alone it picks from everything it has heard of, ignores your budget and can make perfumes up. I wanted the model to be the replaceable part, with the decisions made by rules I could see and test.

### What it cost

Before launch, the recommendations looked right and weren't. Our catalog was in English, and the quiz sent answers in Portuguese. Every match on scent families and notes silently found nothing, so the ranking fell back to brand and release year, and picked at random within the price range. Worse, "notes I hate" never filtered anything. No error, no crash: just confident, well-formed, wrong answers.

### What I did

- **Designed the funnel around the model.** A scoring step with explicit weights picks 150 perfumes from the catalog. A diversity filter keeps at most two per brand, down to 40. Only those 40 reach the model.
- **Made the user's limits hard rules.** Budget and hated notes are filters, not suggestions, so the ranking can't override them.
- **Checked the model's answer.** Every perfume it returns is validated in three steps, so it can't recommend something that isn't in the list.
- **Fixed the placebo at the root.** One shared vocabulary for the whole app, and a matrix linking each mood to each scent family, weighted by occasion. The build now fails if any of the 71 scent families is left unmapped, so this kind of silent bug can't come back.

### What I got

- Recommendations that follow the user's answers, budget and dislikes.
- 500+ recommendations in the first two months after launch.
