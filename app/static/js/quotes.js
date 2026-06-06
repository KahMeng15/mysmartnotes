const quotes = [
    { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
    { text: "Education is the passport to the future, for tomorrow belongs to those who prepare for it today.", author: "Malcolm X" },
    { text: "Success is no accident. It is hard work, perseverance, learning, studying, sacrifice and most of all, love of what you are doing or learning to do.", author: "Pelé" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
    { text: "Don't let what you cannot do interfere with what you can do.", author: "John Wooden" },
    { text: "The only place where success comes before work is in the dictionary.", author: "Vidal Sassoon" },
    { text: "There are no shortcuts to any place worth going.", author: "Beverly Sills" },
    { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
    { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
    { text: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson" },
    { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
    { text: "The best way to predict your future is to create it.", author: "Abraham Lincoln" },
    { text: "Learning is never done without errors and defeat.", author: "Vladimir Lenin" },
    { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
    { text: "Aim for the moon. If you miss, you may hit a star.", author: "W. Clement Stone" },
    { text: "Do not wait; the time will never be 'just right.' Start where you stand.", author: "George Herbert" },
    { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
    { text: "Your attitude, not your aptitude, will determine your altitude.", author: "Zig Ziglar" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
    { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
    { text: "The secret to getting ahead is getting started.", author: "Mark Twain" },
    { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
    { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "The roots of education are bitter, but the fruit is sweet.", author: "Aristotle" },
    { text: "Nothing is impossible. The word itself says 'I'm possible!'", author: "Audrey Hepburn" },
    { text: "Doubt kills more dreams than failure ever will.", author: "Suzy Kassem" },
    { text: "It's not whether you get knocked down, it's whether you get up.", author: "Vince Lombardi" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "Dream big and dare to fail.", author: "Norman Vaughan" },
    { text: "If you are not willing to learn, no one can help you. If you are determined to learn, no one can stop you.", author: "Zig Ziglar" },
    { text: "Work hard in silence, let your success be your noise.", author: "Frank Ocean" },
    { text: "A year from now you may wish you had started today.", author: "Karen Lamb" },
    { text: "Opportunities don't happen, you create them.", author: "Chris Grosser" },
    { text: "Success is walking from failure to failure with no loss of enthusiasm.", author: "Winston Churchill" },
    { text: "Don't stop until you're proud.", author: "Unknown" },
    { text: "The mind is not a vessel to be filled but a fire to be kindled.", author: "Plutarch" },
    { text: "If you can dream it, you can do it.", author: "Walt Disney" },
    { text: "Failure is the opportunity to begin again more intelligently.", author: "Henry Ford" },
    { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
    { text: "Sometimes later becomes never. Do it now.", author: "Unknown" },
    { text: "Great things never come from comfort zones.", author: "Unknown" },
    { text: "Success doesn't just find you. You have to go out and get it.", author: "Unknown" },
    { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
    { text: "Don't stop when you're tired. Stop when you're done.", author: "Unknown" },
    { text: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
    { text: "Do something today that your future self will thank you for.", author: "Sean Patrick Flanery" },
    { text: "Little things make big days.", author: "Isabel Marant" },
    { text: "It's going to be hard, but hard does not mean impossible.", author: "Unknown" },
    { text: "Don't wait for opportunity. Create it.", author: "Unknown" },
    { text: "The key to success is to focus on goals, not obstacles.", author: "Unknown" },
    { text: "Dream it. Wish it. Do it.", author: "Unknown" },
    { text: "Every day is another chance to change your life.", author: "Unknown" },
    { text: "What we learn with pleasure we never forget.", author: "Alfred Mercier" },
    { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
    { text: "Wisdom is not a product of schooling but of the lifelong attempt to acquire it.", author: "Albert Einstein" },
    { text: "Education is not preparation for life; education is life itself.", author: "John Dewey" },
    { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
    { text: "Change is the end result of all true learning.", author: "Leo Buscaglia" },
    { text: "Anyone who stops learning is old, whether at twenty or eighty. Anyone who keeps learning stays young.", author: "Henry Ford" },
    { text: "The only person you are destined to become is the person you decide to be.", author: "Ralph Waldo Emerson" },
    { text: "Develop a passion for learning. If you do, you will never cease to grow.", author: "Anthony J. D'Angelo" },
    { text: "I attribute my success to this: I never gave or took any excuse.", author: "Florence Nightingale" },
    { text: "I am not a product of my circumstances. I am a product of my decisions.", author: "Stephen Covey" },
    { text: "The most difficult thing is the decision to act, the rest is merely tenacity.", author: "Amelia Earhart" },
    { text: "How wonderful it is that nobody need wait a single moment before starting to improve the world.", author: "Anne Frank" },
    { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
    { text: "What you get by achieving your goals is not as important as what you become by achieving your goals.", author: "Zig Ziglar" },
    { text: "I can't change the direction of the wind, but I can adjust my sails to always reach my destination.", author: "Jimmy Dean" },
    { text: "If you want to lift yourself up, lift up someone else.", author: "Booker T. Washington" },
    { text: "You may be disappointed if you fail, but you are doomed if you don't try.", author: "Beverly Sills" },
    { text: "When everything seems to be going against you, remember that the airplane takes off against the wind, not with it.", author: "Henry Ford" },
    { text: "A person who never made a mistake never tried anything new.", author: "Albert Einstein" },
    { text: "To live a creative life, we must lose our fear of being wrong.", author: "Joseph Chilton Pearce" },
    { text: "Trust yourself. You know more than you think you do.", author: "Benjamin Spock" },
    { text: "You don't cross the sea merely by standing and staring at the water.", author: "Rabindranath Tagore" },
    { text: "Only those who attempt the absurd can achieve the impossible.", author: "Albert Einstein" },
    { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
    { text: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson" },
    { text: "Do one thing every day that scares you.", author: "Eleanor Roosevelt" },
    { text: "All our dreams can come true, if we have the courage to pursue them.", author: "Walt Disney" },
    { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas A. Edison" },
    { text: "Whenever you find yourself on the side of the majority, it is time to pause and reflect.", author: "Mark Twain" },
    { text: "Fall seven times and stand up eight.", author: "Japanese Proverb" },
    { text: "If you want to achieve greatness stop asking for permission.", author: "Unknown" },
    { text: "Things work out best for those who make the best of how things work out.", author: "John Wooden" },
    { text: "To live is the rarest thing in the world. Most people exist, that is all.", author: "Oscar Wilde" },
    { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius" },
    { text: "Magic is believing in yourself, if you can do that, you can make anything happen.", author: "Johann Wolfgang von Goethe" },
    { text: "If you don't build your dream, someone else will hire you to help them build theirs.", author: "Dhirubhai Ambani" },
    { text: "What seems to us as bitter trials are often blessings in disguise.", author: "Oscar Wilde" },
    { text: "The distance between insanity and genius is measured only by success.", author: "Bruce Feirstein" },
    { text: "Life is 10% what happens to you and 90% how you react to it.", author: "Charles R. Swindoll" },
    { text: "We become what we think about.", author: "Earl Nightingale" },
    { text: "The most common way people give up their power is by thinking they don't have any.", author: "Alice Walker" },
    { text: "Mind is a flexible mirror, adjust it, to see a better world.", author: "Amit Ray" },
    { text: "Education forms minds, but only experience forms character.", author: "Unknown" },
    { text: "The goal of education is the advancement of knowledge and the dissemination of truth.", author: "John F. Kennedy" }
];

function setRandomQuote() {
    const quoteContainer = document.getElementById('quoteContainer');
    const quoteText = document.getElementById('quoteText');
    const quoteAuthor = document.getElementById('quoteAuthor');

    if (!quoteContainer || !quoteText || !quoteAuthor) return;

    // Trigger animation re-flow
    quoteContainer.style.animation = 'none';
    quoteContainer.offsetHeight; // trigger reflow
    quoteContainer.style.animation = null;

    const randomIndex = Math.floor(Math.random() * quotes.length);
    const quote = quotes[randomIndex];

    quoteText.innerText = quote.text;
    quoteAuthor.innerText = `- ${quote.author}`;
}

document.addEventListener('DOMContentLoaded', setRandomQuote);
