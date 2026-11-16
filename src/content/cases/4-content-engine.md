---
order: 4
slug: content-engine
label: Content engine
stmt: Trends in. Posts out. Under $1 a week.
sub: Trend-driven content for Scentia's Instagram · From n8n to production code
---

### What I wanted

Scentia needed a steady flow of Instagram posts, with no budget for a content team. I wanted a system that reads what's trending each week and drafts posts for a person to review.

### What it cost

The first version was a no-code prototype in n8n. It worked, but it was fragile and hard to change, so I rebuilt it as production code.

### What I did

- Pulled weekly trend signals from TikTok, Google Trends and other sources, and turned them into post ideas and carousels.
- **Measured before cutting costs.** The model wasn't the problem. The same 22,827-token brand guide went out with every post at full price, and because the posts were written in parallel, the cache never kicked in. I made the first post warm the cache before the others, trimmed the prompts, and lowered the model's reasoning effort where it didn't help.
- **Chose reliability over the last few dollars.** Cheaper options would have saved under $25 a year, not worth a pipeline that breaks.

### What I got

- Writing cost per post down from about $0.08 to $0.02.
- US$ 6.80 in API costs over the first eight weeks, under $1 a week.
