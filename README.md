# Gilmore Cleaning Services

Booking web app for Gilmore Cleaning Services: lawn care, house cleaning and moving, gutters, windows, car detailing, pressure washing, trash can sanitization and pet waste removal.

## What's here

| File | What it is |
| --- | --- |
| `index.html` | The customer app. Customers pick a service, choose an open time, book, and later reschedule or cancel from **My appointments**. |
| `owner.html` | The owner dashboard. Sign in with your email to see every appointment by day, mark jobs done, or cancel. |
| `config.js` | Your account keys. While it's empty the app runs in demo mode and bookings stay on the customer's phone. |
| `supabase/schema.sql` | The bookings database. Run it once in Supabase. |
| `img/` | Service photos from the Gilmore Instagram posts. |

## How it works once set up

- A customer books. The booking is saved in your Supabase database and that time disappears for every other customer. Two bookings can never overlap.
- You get an email with the service, date and time, the customer's name, phone and address, and their notes. You also get one when a customer reschedules or cancels.
- On `owner.html` you see today, the next 7 days and all upcoming appointments. Customers can't see anyone else's details.

Business hours are Mon–Sat, 8:00 AM to 6:00 PM. To change them, edit `OPEN_MIN` and `CLOSE_MIN` in `index.html`.

## One-time setup

1. **Put the site online.** In this repo, open **Settings → Pages**, set the branch to `main` and the folder to `/ (root)`, then press **Save**. Your link will be `https://yeayea240711.github.io/Gilmore-cleaning-services-/`.
2. **Create the database.** Sign up at [supabase.com](https://supabase.com) and create a new project. Open **SQL Editor**, paste in all of `supabase/schema.sql`, replace `YOUR-EMAIL@example.com` on the last line with the email you'll sign in with, and press **Run**.
3. **Allow owner sign-in.** In Supabase, open **Authentication → URL Configuration**. Set **Site URL** to your link from step 1, and add `https://yeayea240711.github.io/Gilmore-cleaning-services-/owner.html` under **Redirect URLs**.
4. **Get your keys.** In Supabase, open **Project Settings → API** and copy the **Project URL** and the **anon public** key. Both are meant to be public. The database rules keep customer details private.
5. **Turn on booking emails.** At [web3forms.com](https://web3forms.com), enter the email where you want booking alerts, and they'll email you an access key.
6. Put the three values into `config.js` and you're live.
