# Gilmore Cleaning Services

Booking web app for Gilmore Cleaning Services: lawn care, house cleaning and moving, gutters, windows, car detailing, pressure washing, trash can sanitization and pet waste removal.

## What's here

| File | What it is |
| --- | --- |
| `index.html` | The customer app. Customers pick a service, choose an open time, book, and later reschedule or cancel from **My appointments**. |
| `owner.html` | The owner dashboard. Sign in with your passcode to see every appointment by day, mark jobs done, or cancel. |
| `google/Code.gs` | The booking script. It saves bookings to your Google Sheet and emails you from Gmail. |
| `config.js` | Holds the link to your booking script. While it's empty the app runs in demo mode and bookings stay on the customer's phone. |
| `img/` | Service photos from the Gilmore Instagram posts. |

## How it works once set up

- A customer books. The booking is added as a row in your Google Sheet, and that time disappears for every other customer. Two bookings can never overlap.
- Gmail sends you an email with the service, date and time, the customer's name, phone and address, and their notes. You also get one when a customer reschedules or cancels.
- You see appointments on `owner.html` or right in the Sheet. Customers can't see anyone else's details.

Business hours are Mon–Sat, 8:00 AM to 6:00 PM. To change them, edit `OPEN_MIN` and `CLOSE_MIN` in `index.html`.

## One-time setup (about 10 minutes, free)

1. **Put the site online.** In this repo, open **Settings → Pages**, set the branch to `main` and the folder to `/ (root)`, then press **Save**. Your link will be `https://yeayea240711.github.io/Gilmore-cleaning-services-/`.
2. **Make the Sheet.** At [sheets.new](https://sheets.new), create a blank Google Sheet and name it **Gilmore Bookings**.
3. **Add the booking script.** In the Sheet, open **Extensions → Apps Script**. Delete the sample code, paste in all of `google/Code.gs`, and change `change-me` on the `OWNER_PASSCODE` line to a passcode only you know. Press **Save**.
4. **Publish the script.** Press **Deploy → New deployment**. Click the gear and pick **Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**, then press **Deploy**. Google will ask you to allow access. Pick your account, then **Advanced → Go to project (unsafe) → Allow**. Google shows this warning for any script you write yourself.
5. **Copy the Web app URL** that ends in `/exec` and put it in `config.js` as `googleScriptUrl`.

If you change `Code.gs` later, use **Deploy → Manage deployments → Edit → New version** so the link stays the same.

## Deposits (optional)

Customers pay a $20 deposit on Stripe's secure checkout page to hold their time. Nobody types card details into this site. The deposit comes off the bill after the job. If a customer cancels more than 24 hours ahead you get an email saying to refund it; closer than that, you keep it. Free quote visits don't need a deposit. An unpaid booking gives its time back after 30 minutes.

You only get the **New booking** email once the deposit is paid. The Sheet's **Deposit** column and the owner page show where each one stands.

To turn it on:

1. **Make the payment link.** In Stripe, open **Payment Links → New**. Add a product named **Booking deposit** with a one-time price of **$20**. Under **After payment**, pick **Don't show confirmation page** and enter `https://yeayea240711.github.io/Gilmore-cleaning-services-/?deposit=paid#appointments`. Create it and copy the link (it starts with `https://buy.stripe.com/`).
2. **Make a read-only key.** In Stripe, open **Developers → API keys → Create restricted key**. Name it **Gilmore Bookings**, set **Checkout Sessions** to **Read**, leave everything else as **None**, and create it. Copy the key (it starts with `rk_live_`).
3. **Paste both into the script.** In Apps Script, paste the new `google/Code.gs` (keep your passcode), then put the link in `STRIPE_PAYMENT_LINK` and the key in `STRIPE_SECRET_KEY`. Press **Save**.
4. **Run setup once.** In the function menu at the top, pick **setupDeposits** and press **Run**. Allow the permissions Google asks for. It checks the key and starts a payment check every 10 minutes.
5. **Publish it.** Use **Deploy → Manage deployments → Edit → New version → Deploy**.

To change the amount or the refund rule, edit `DEPOSIT_AMOUNT`, `DEPOSIT_REFUND_EARLY` and `DEPOSIT_KEEP_HOURS` near the top of `Code.gs` (and the Payment Link's price), then publish a new version.

## Photos

The photos in `img/` are free stock photos from [Unsplash](https://unsplash.com/license) (free to use, no credit required). They are cropped and resized to 1400 pixels wide so they stay sharp on phones and big screens but still load fast.

- `pressure.jpg`: https://unsplash.com/photos/kQHsQmLLV2I
- `bins.jpg`: https://unsplash.com/photos/8VOZZC1VNnU
- `pet.jpg`: https://unsplash.com/photos/DZ3ixpNPt7c

To use your own photo instead, replace the file with one of the same name.
