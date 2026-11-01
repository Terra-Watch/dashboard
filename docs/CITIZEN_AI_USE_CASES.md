# Using the AI check for citizens: use cases and first test results

Status: PROPOSED, 2026-11-01. Written for the owner and the engineers. Nothing here is built except the authenticity check on community posts.

## 1. What the model can honestly do for a citizen

The model has two parts. One part guesses whether a photo shows flames or smoke. The other part (authenticity) guesses whether a photo looks edited, generated, or seen before. Neither part may block a citizen or decide anything. The use cases below follow from that.

What we know about how good it is:
- On a camera source it had never seen, it missed about 29% of flames and 52% of smoke. So it must never tell a citizen "this is not a fire".
- It has not been tested on citizen phone photos.
- Authenticity results on our first test are in section 4.

## 2. The use cases, in order of value and safety

| # | Use case | What the citizen sees | Uses | Risk |
|---|---|---|---|---|
| 1 | **Photo coach before sending** | "This photo is blurry. Hold steady and try again", "Too dark", "Mostly sky: step back and include the horizon", "Wide view first, then a close one." The citizen can always send anyway. | Image quality checks (sharpness, brightness, size); no fire verdict | Low. Never mentions fire or authenticity |
| 2 | **Nearby duplicate hint** | "Someone nearby reported smoke 20 minutes ago. Add your photo to help officials confirm it." One tap adds the photo to that report. | Position and time, plus photo similarity (the model's image fingerprint) | Low. Helps build the proof the Control Room needs |
| 3 | **Neutral status when a photo is held** | "Officials will check your photo before others can see it." The reason is not shown. Their own copy stays visible to them. | Authenticity result as a hold rule | Medium: a wrong hold can feel like an accusation, so the wording never says why |
| 4 | **Safer public feed** | Fewer fake or reused photos on Near me. A "Report this photo" button for everyone. | Authenticity holds plus citizen reports | Medium: false holds delay real reports, see section 4 |
| 5 | **Photo guidance that improves staff decisions** | Guided capture: a wide shot with the horizon, then a close shot, with a landmark. | Quality checks | Low |
| 6 | **Community posts** | A held post says "A moderator will look at your photo shortly." | Authenticity (already live) | Medium, same wording rule as 3 |
| 7 | **Later, only after a phone-photo test:** a soft prompt such as "We can't see smoke here. Is it mist or cooking smoke? You can still send." | Fire and smoke guess | Needs real phone photos first. Not before |

What is deliberately NOT a use case:
- Telling a citizen "AI says this is a real fire" or "this is fake".
- Blocking a report because the model sees nothing.
- Showing scores or the reason for a hold.

## 3. Design rules for every citizen-facing message

1. Say what happens next, not what the model found.
2. Never accuse. A held photo is "waiting for a check", not "suspicious".
3. Sending is never blocked by the AI. At most it nudges, and the citizen can ignore the nudge.
4. Every nudge has an exit: "Send anyway".
5. If the check is unavailable, the screen says nothing about it. The report still goes through.
6. English first. The wording is short enough to translate later.

## 4. First test of the authenticity check (community posts path)

The test runs the same code a community post runs, with the signed community bundle (v1.2.0). The script is `backend/scripts/eval_community_authenticity.py`, the raw numbers are in `docs/data/community_authenticity_test_2026-11-01.json`. "Held" means the post would wait for a moderator (anything except "no concern found").

| Group (what it is) | Photos | Held | Wanted | Verdict |
|---|---|---|---|---|
| Real fire scenes (D-Fire web photos) | 40 | 20% | published | acceptable, not great |
| Real look-alike photos (fog, sunsets, burns, from Wikimedia) | 40 | **87.5%** | published | **poor**: 25 of 40 called possibly generated |
| Real photos sent through a messaging app (half size, low quality) | 20 | 10% | published | good |
| Harmless edits (resize, brighten, crop) | 40 | 30% | published | middling: 10 are "inconclusive" because the result is small or low quality |
| Edited by pasting a patch from another photo | 40 | 95% | held | good |
| Edited by covering a region | 20 | 80% | held | good |

How to read it:
- It catches pasted and covered-up edits well.
- It holds far too many professional or heavily processed web photos as "possibly generated". Those are not what citizens send, but it shows the check is tuned to the kind of photos it was trained on.
- The test did NOT include AI-generated images: no image generator is installed here. An earlier test on a cloud machine covered those.
- The edits were made by me with simple pasting, like the ones the check was trained on, so the catch rates are probably optimistic for real-world edits.
- Nothing here used real phone photos.

## 4b. Second test: AI-generated images, and what a different alarm level would do (2026-11-01)

The generated images and the fixed-camera frames come from the cloud store of the earlier experiments, so this test covers what the first one could not. Same code path as a community post. Raw numbers: `docs/data/authenticity_sets_test_2026-11-01.json` and `docs/data/authenticity_threshold_table_2026-11-01.json`; scripts: `backend/scripts/eval_authenticity_sets.py` and `fire-evidence-assessor/scripts/auth_threshold_analysis.py`.

| Group | Photos | Held | Wanted | Verdict |
|---|---|---|---|---|
| AI-generated, from a tool the check was trained on | 100 | 100% | held | meets the target |
| AI-generated, from two tools it never saw (PixArt, Kolors) | 200 | 100% | held | meets the target |
| Real D-Fire photos (reduced to 512 px) | 100 | 29% | published | too many held; 19 of 29 are "inconclusive" (too small or too soft to judge) |
| Real fixed-camera frames | 100 | 25% | published | too many held; 24 of 25 are "inconclusive" |

What it shows:
- The core call, "possibly generated", works: 99 to 100% of generated images flagged, including from tools it had never seen, and only about 5% of real D-Fire photos and 0.3% of fixed-camera frames wrongly flagged.
- Most wrongly held real photos are not "generated" calls. They are "inconclusive" because of the quality gate (size and softness). The test pictures were 512 px, so a normal phone photo, which is much larger, would trip it less often. Hazy smoke photos are soft by nature, so some will still be held as inconclusive. That gate is a policy to revisit with real phone photos.
- The weak spot is professional web photos of look-alikes (Wikimedia, 1,437 photos): 57% flagged as generated at the current alarm level. A higher level helps, at a cost (share of look-alike photos wrongly flagged versus share of generated images still caught):

| Alarm level | Look-alikes wrongly flagged | Generated caught (seen / PixArt / Kolors) |
|---|---|---|
| now (0.15) | 57% | 100% / 99% / 100% |
| 0.50 | 24% | 96% / 89% / 98% |
| 0.65 | 15% | 92% / 81% / 96% |
| 0.80 | 8% | 81% / 68% / 90% |

I did not change the alarm level. Those look-alike photos are not what citizens send, and the best level depends on real phone photos. Retuning now would trade away catches for a population we have not measured.

## 4c. Collecting the phone photos (built)

- **Opt-in at the source:** when a citizen adds photos to a report, an unticked box reads "Optional: let TerraWatch keep these photos to test and improve its photo check. No one else sees them, and no name or location is kept with them." On their report page they can take it back at any time, and the labels go with it.
- **Labelling:** Control Room, Notices page, "Photo library" tab. Staff in scope see photos whose owner agreed and say what is in each (flames, smoke, both, a look-alike, nothing) and where it comes from (a genuine camera photo, edited, made by an AI tool, a screenshot). A counter shows progress toward 200.
- **Export:** `backend/scripts/export_photo_library.py OUT` writes labelled photos with all hidden data removed, in the format the test script reads.
- **Then:** run `eval_authenticity_sets.py OUT/manifest.csv --root OUT` and `auth_threshold_analysis.py --folder OUT/img:phone ...`. If the numbers miss the targets in section 5, retune or refit the head, build a new bundle version and ask for its approval. A new bundle is a new approval decision for the owner.

## 5. What is needed before the AI touches the citizen experience

1. **A phone-photo test set.** 200 or more real photos from phones (fire, smoke, look-alikes, dusk, haze, long distance, sent through a messaging app), labelled by Control Room staff. This is the same missing gate as before.
2. **A look at the false holds.** Retrain or recalibrate the authenticity part with real phone photos and web photos as negatives, so look-alike photos are not called generated.
3. **Targets to pass** before use cases 3, 4 and 6 run on citizens' photos: at most 10% of real phone photos held; at least 85% of edited photos held; at least 80% of generated photos held; results listed by group in this document.
4. **A review of the wording** for every citizen-facing message in section 2, with a Control Room member.

## 6. Build order

| Step | What | Needs the model? |
|---|---|---|
| 1 | Photo coach (use cases 1 and 5): sharpness, brightness, framing hints in the camera screen, in the browser, so it works offline | No, runs on the phone |
| 2 | Nearby duplicate hint (use case 2) | Position and time first; photo similarity in a later step |
| 3 | Neutral wording for held photos and posts (use cases 3, 4, 6), plus "Report this photo" | Uses the existing holds |
| 4 | Phone-photo test, recalibration, targets from section 5 | Yes |
| 5 | The soft smoke prompt (use case 7), only if step 4 shows it is reliable | Yes |

Decisions for the owner:
1. Do steps 1 to 3 now, and hold step 5 until the phone-photo test?
2. Who will collect and label the phone photos, and how long can that take?
3. May a citizen see "Officials will check your photo" on a held photo, with no reason given?
