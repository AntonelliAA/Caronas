# The problem, and what the research changed

## The actual complaint

One driver, three passengers, different schedules. One rides Monday through
Wednesday, another rides two of those days, another rides every day. At the end
of the month nobody can reconstruct who rode when, so the money is guesswork.

## Why every carpool spreadsheet dies

The obvious fix is a shared sheet where the driver logs each ride. Nobody
sustains that for thirty days. The reason is structural rather than a matter of
discipline: it asks for an entry on the frequent event.

Rides happen roughly twenty times a month per person. Absences happen once or
twice. Put the data entry on the absence and the total number of taps per month
drops by an order of magnitude, and the person with the information (the one
who is not coming) is the one entering it.

Everything else in the app is bookkeeping around that one inversion.

## What existing carpool tools do

A survey of carpool apps and cost-splitting templates
([Scoop](https://apps.apple.com/us/app/scoop-carpooling-commuting/id997978145),
[MyCarpoolApp](https://play.google.com/store/apps/details?id=com.mycarpoolapp.www),
[a Google Sheets splitter template](https://infoinspired.com/google-docs/spreadsheet/carpool-cost-splitter-rotation-tracker-google-sheets/),
and a [round-up of the category](https://savinly.com/other/carpool-apps/))
turned up four ideas worth keeping and a pile worth ignoring.

Worth keeping:

- **Set-and-forget recurring schedules.** Configure Monday through Friday once
  and stop touching it. This is the core of the model here.
- **Automatic cost splitting** on top of the day count, rather than as a
  separate exercise at the end of the month.
- **Cancellation visible to everyone immediately**, so the driver is not waiting
  in front of a house.
- **A monthly review step**, because fares and schedules drift.

Ignored, because they solve a different problem: route matching, standby
queues, in-app chat, digital wallets, driver rotation. Those exist for
carpools that are still forming. This one is four people who already know the
route and already know each other; a chat feature competes with the WhatsApp
group they already have.

## Decisions that came out of it

**Price per day, not per month.** A fixed monthly amount hides exactly the thing
the driver cannot currently see. Days times fare shows the work.

**Holidays are automatic.** In the original complaint, holidays were a bigger
source of error than absences, because nobody remembers in November which
Tuesday in September was a holiday. See `architecture.md` for how they are
computed.

**Two numbers, not one.** What is owed today, and what the month projects to.
See `architecture.md`.

**Payment is a toggle, not a ledger.** "Did this person pay for August" is one
bit. Tracking partial payments would require an amounts table and a
reconciliation view for a group of three people who pay in one Pix.

**A share button that writes the WhatsApp message.** The month does not close in
the app; it closes in the group chat. `navigator.share` opens the native sheet
with the text already formatted.

## Vocabulary

The UI is in pt-BR and these words appear throughout the code. Keeping them
in Portuguese in identifiers avoids a translation layer between what the user
reads and what the code says.

| Term | Meaning |
|---|---|
| carona | one ride, the unit being counted |
| falta | an absence: a scheduled day the person did not ride |
| escala | someone's weekly schedule of days |
| folha do mês | the month ledger: one row per day, one column per person |
| sem carona | a day nobody rode, from a holiday or a driver override |
