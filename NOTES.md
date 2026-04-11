# Goal
Build a js script that can infinitely craft on neal.fun/infinite-craft
 - Without getting blocked
 - As fast as a human can at peak speed

# Strategy
Click two random elements (this part is working)
Drag one element to the other (started, but not done yet)
Repeat infinitely

Add in random waits periodically.  Let's do it like this:
 - 50% chance of random 50-100ms wait
 - 40% chance of random 100-200ms wait
 - 8% chance of random 200-1000ms
 - 1% chance of random 1000-5000ms wait
 - 1% chance of random 5000-15000ms wait

Console.log what is happening so user knows.



# AI Guidance
 - Ask me for info you need, don't worry about trying to read from neal.fun - that would be tricky - I can inspect selectors, etc. for you instead.
