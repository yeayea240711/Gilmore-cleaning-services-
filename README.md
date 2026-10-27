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
