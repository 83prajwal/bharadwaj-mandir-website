BHARADWAJ MANDIR: MOTION AND DESIGN UPGRADE
===========================================

This adds animation and polish on top of your existing site. Your brand
(maroon, gold, ivory, Cormorant Garamond and Montserrat), your pages, your
Netlify enquiry form, analytics, cookie consent and the chat assistant are
unchanged.

WHAT IT ADDS
- Hero: headline slides in line by line, the gold rule draws, the photo is
  unveiled and settles, and a soft warm glow breathes behind the copy.
- Subtle marble veining on the hero and on the custom, FAQ and collection sections.
- A slow ticker under the hero, built only from details already on your site.
- Sections and cards ease in as you scroll. Cards lift on hover with a gold frame.
- The four enquiry steps draw their gold lines as they appear.
- Header shrinks and blurs after scrolling. A thin gold progress bar shows
  how far down the page you are.
- Buttons get a light sweep on hover. Form fields glow gold when selected.
- A floating "Chat on WhatsApp" button (see the note below).
- Everything stays still and fully visible for visitors who have
  "reduce motion" turned on, or if JavaScript is blocked.

HOW TO ADD IT TO YOUR PROJECT
1. Back up your project folder (copy it, or commit to git first).
2. Unzip this folder over your project root so that the "src" folders merge.
   New files:
     src/motion.css
     src/components/MotionEffects.jsx
     src/components/Ticker.jsx
     src/components/FloatingContact.jsx
   Files replaced (each has only a few lines added):
     src/main.jsx          adds:  import './motion.css'
     src/App.jsx           adds:  import MotionEffects, import FloatingContact,
                                  <MotionEffects /> after <AnalyticsTracking />,
                                  <FloatingContact /> after <EnquiryAssistant />
     src/pages/Home.jsx    adds:  import Ticker, and <Ticker /> after <Hero />
   If you changed those three files after sending them to me, do not overwrite
   them. Add the lines listed above by hand instead.
3. Run  npm run dev  and look at it in your browser.
4. Run  npm run build  to confirm it builds, then deploy to Netlify as usual.

TO REMOVE PIECES
- Whole upgrade: delete the import './motion.css' line in main.jsx.
- WhatsApp button: delete <FloatingContact /> in App.jsx.
- Ticker: delete <Ticker /> in Home.jsx.

CHECK BEFORE GOING LIVE
- WhatsApp uses +91 99538 36555, the number already in your footer. If that
  number is not on WhatsApp, remove the button or change the number in
  src/components/FloatingContact.jsx.
- Open the site on your phone as well as your computer.
