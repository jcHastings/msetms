# QuickBooks production mapping (draft)

This is the mapping the TMS uses when it sends an invoice or a bill to MS Express's QuickBooks company. The TMS does not create customers, vendors, accounts, or items. A missing driver class may be created when class auto-create is on. Names are read from the connected company. A manual Map Pay Items or Map Vendors id is an override, and the item's account is still checked before anything is posted. One bad line blocks the whole send. An account whose name contains "uncategorized" or "miscellaneous" is refused.

## Invoice number

The QuickBooks DocNumber is the TMS load number, such as MSE-1055. The send does not continue the old 1006 invoice sequence and does not require an existing 1006 invoice before it will post.

QuickBooks allows 21 characters on DocNumber. A longer load number stops the send with a message that names the length. The number is not truncated. The load number still goes in the customer memo, the private note, and the line descriptions. The lane in that memo is written `Hastings, NE to Omaha, NE`. The arrow character is not used there, because the QuickBooks PDF drops it.

If QuickBooks already has an invoice with that DocNumber, the send updates that invoice and does not create a second one. A re-send updates the same invoice and sends the same DocNumber again.

The number is stored on the load as `qbo_doc_number` (nullable text, added with the usual column migration) and copied into `qbo_invoice_number`. The load screen and the QuickBooks panel label it **QB invoice #**. The QuickBooks invoice id stays in `qbo_invoice_id`.

Before a successful sync, the TMS PDF invoice number is the TMS invoice number, or `INV-{load number}` when that is blank. After the sync, that same PDF field is `qbo_doc_number`, which is the load number. The PDF also prints **MS Express load #** and, when the load has one, **Customer ref #**. The QuickBooks customer memo starts `MS Express load MSE-1055 · Customer ref 12345` (no colon after "ref"). The memo is cut at 1,000 characters, which is QuickBooks' CustomerMemo limit.

## Invoice lines

| Decision | TMS pay item | QuickBooks item | QuickBooks account | Behavior | Test |
|---|---|---|---|---|---|
| 9 | Flat Rate / load rate | Line Haul | Gross Trucking Income | Name match or Map Pay Items override. Account must match or the send stops. | C24, C01 |
| 10 | Detention | Detention | Income. Production account name is Detention. Sandbox account name is Detention Income. | The line posts to the Detention item. The account name is not compared. A missing Detention item, or an item that is not on an income account, blocks the send. Detention is not routed to Line Haul. | C04, C37 |
| 10 | Extra Stop | Picks and Drops | Gross Trucking Income | Item name is Picks and Drops, not the TMS label. | C06 |
| 10 | Layover | Line Haul | Gross Trucking Income | Own line. Description says "Layover". No Layover item. | C25, C05 |
| 10 | TONU | Line Haul | Gross Trucking Income | Own line. Description says "TONU". Cancelled loads bill TONU only. | C25, C08 |
| 10 | Washout | Trailer Washout | Gross Trucking Income | Posts to the Trailer Washout item. A missing item or an item that is not on Gross Trucking Income blocks the send. | C25, C07 |
| 10 | — | Return | Gross Trucking Income | Already in QuickBooks. No TMS pay category sends it. | — |
| 11 | Fuel Surcharge | Line Haul | Gross Trucking Income | Own line. Description says "Fuel surcharge". No Fuel Surcharge item. No miles × rate calculation. | C26, C09 |
| 12 | Lumper | Lumper | Income | Billed lumper posts to the Lumper item. The account must be income. The account name is not compared. A cost account, including the old Lumper COGS account, blocks the send. A missing Lumper item blocks the send. Nothing is created. | C27, C03 |
| 13 | Misc. | Adjustment | Gross Trucking Income | Unchanged. Negative amounts are allowed. The production company has no Adjustment item, so a Misc. line still needs that item before it can post. | C28, C11 |
| 14 | Trailer Rental, Fuel Advance Fee, Claim for Damages | — | — | Not billed. The send stops and names the line. | C29, C17 |
| 1 | Lumper | Lumper | Income | One customer amount. A pay line and a driver receipt that disagree block the PDF and the send. | C03 |
| 2 | Fuel Surcharge | Fuel Surcharge | Gross Trucking Income | No miles × rate calculation. The amount stays on the Fuel Surcharge line. | C09 |
| 3 | — | — | — | DocNumber is the TMS load number. Longer than 21 characters is refused. An existing DocNumber is updated. | C19, C21 |
| 4 | Customer 317 MS Express | — | — | Never mapped and never invoiced, even if an id is stored. | C22 |
| 5 | Customer 294 M&S Management Group | — | — | No automatic name match. An id the office saved is used. | C23 |
| 17 | Any other customer | Customer.DisplayName | — | Unique match after trim, whitespace collapse, and case folding. No fuzzy match and no create. More than one match stops the send. No match names the TMS customer and stops that invoice. | C32 |
| 18 | Customer payment terms | Term.Name | — | Exact term name. Blank terms omit SalesTermRef. | C20 |
| 19 | Driver | Class.Name | — | The invoice and each line use the driver's class. No driver means no class. A missing class is created only when `QBO_CLASS_AUTO_CREATE` is on (default on when `QBO_SANDBOX` is true, off in production unless set). `QBO_CLASS_AUTO_CREATE=true` creates in production too: one class per driver, named with the exact trimmed TMS driver name. An existing class with the same name (case-insensitive, collapsed spaces) is reused. Customers, vendors, accounts, and items are never created. | C34 |
| 20 | — | — | — | ARAccountRef is never set. The company default A/R is used. | C35 |

## Bills

| Decision | TMS line | QuickBooks account | Behavior | Test |
|---|---|---|---|---|
| 15 | Single-amount bill, no override | Owner Operators:Owner Operators COL | Vendor map expense account wins, then `QBO_BILL_EXPENSE_ACCOUNT_ID`, then this name. | C30, C15, C14 |
| 16 | Load pay | Owner Operators:Owner Operators COL | Split lines ignore the vendor and env overrides. | C31 |
| 16 | Fuel deduction | Owner Operators:Fuel | Negative line. Bill total must stay above zero. | C31 |
| 16 | Tolls | Driver Expenses:Toll | Negative line. | C31 |
| 16 | Insurance | Insurance:OCC | Negative line. | C31 |
| 16 | ELD | Office and Admin Expense:Software | Negative line. | C31 |
| 16 | Loan repayment | Loan - {vendor name} | Asset account. Example: Loan - Lumig Transports LLC. | C31 |
| 17 | Vendor | Vendor.DisplayName | Exact name only. No create. | C32 |

A bill whose lines total zero or less is refused before any QuickBooks call. The offline harness also rejects a non-positive bill total. If a live company later rejects a negative deduction line, the open question is whether that deduction should be a vendor credit instead. This draft does not create vendor credits.

## Bookkeeper fix list

Do these in the QuickBooks company before a production send. The TMS will not create them.

1. The **Lumper** item posts billed lumper. Its account is income. The 10/13 COGS account is not used. A missing item is not created.
2. **Trailer Washout** posts to the Trailer Washout item on **Gross Trucking Income**.
3. Create an **Adjustment** item on Gross Trucking Income for Misc. lines. Until that item exists, a Misc. line blocks the send. Fuel surcharge, layover, and TONU do not need their own items: each stays its own line on **Line Haul**.
4. Detention posts to the **Detention** item. The account is income. Production names that account Detention. The sandbox names it Detention Income. The send matches the item, not the account name. A missing Detention item blocks the send and is not created.
5. Confirm payment-term names match the TMS customer terms exactly (the harness uses Net 30).
6. Leave customer 317 (MS Express) and customer 294 (M&S Management Group) unmapped until the office picks 294 by hand. Do not map 317. Other customers match one QuickBooks DisplayName after trim, collapsed spaces, and case folding. No match blocks that invoice. Customers are never created.
7. Confirm the bill accounts exist with these fully qualified names: Owner Operators:Owner Operators COL, Owner Operators:Fuel, Driver Expenses:Toll, Insurance:OCC, Office and Admin Expense:Software, and Loan - {vendor} for each owner-operator who has a loan repayment.
8. Driver classes use the driver's name. Production does not create a class unless `QBO_CLASS_AUTO_CREATE=true`. That setting creates one class per driver, using the exact TMS driver name, and reuses a class with the same name in any case. A load with no driver is sent with no class.

## Sandbox company 5710

A live campaign resolves the same production names and does not create "MSETMS Test" customers, vendors, accounts, or items. These names have to already be in realm 9341458445928351:

Items: Line Haul, Detention, Picks and Drops, Trailer Washout, Lumper, Adjustment, Return. Layover, TONU, and Fuel Surcharge are not required items.

Accounts: Gross Trucking Income, Owner Operators:Owner Operators COL, Owner Operators:Fuel, Driver Expenses:Toll, Insurance:OCC, Office and Admin Expense:Software, Loan - Lumig Transports LLC, Billable Expense Income, Trailer Rentals, Factoring Fee, Sales, Service/Fee Income, Uncategorized Income, Carrier Expense, Owner Operators, Owner Operators:Advances, Owner Operators:Insurance COL, Drivers Paid by RC. Detention and Detention Income are not required names. The Detention item's income account is read from the item. Uncategorized Income is looked up so a send can refuse it; it is never a post target.

Wrong-chart blocks (C22–C27, C29–C32, C34–C35) run only in the offline harness. A fixed sandbox would not fail those blocks.
