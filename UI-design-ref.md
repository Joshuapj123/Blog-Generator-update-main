## **Core Philosophy: Soft, Warm, and Vibrant**

The design moves away from stark white backgrounds and harsh lines. Instead, it embraces a warm, soft base layer overlaid with clearly defined, floating content cards. Actions are drawn to the user's eye using vibrant, premium-feeling gradients rather than flat solid colors.

## **1. Global Theming & Backgrounds**

**Principle:** Use a warm, soft background color to reduce eye strain and provide contrast for floating white cards. The main application wrapper should be slightly off-white.

- **Background:** (--color-indigo-50) 50% Opacity, border: border-indigo-100
- **Text (Primary):** `text-gray-900` or `text-gray-800` (Never pure black `#000` for primary text to prevent harsh contrast).
- **Text (Secondary/Muted):** `text-gray-500` or `text-gray-400`.

**Global CSS setup (**

**globals.css):**

```
css

body {
color:#1a1a1a;
background:#f4f1ea;
}
```

## **2. Card Design (Content Containers)**

**Principle:** Content should live inside soft, floating cards with generous border radii and no hard borders. Shadows create the illusion of depth stacked on the warm background.

- **Container Styling:** `bg-white p-6 md:p-8 rounded-2xl shadow-md border-0`
- **Hover Effects:** Add slight floating effects to interactive cards to make the UI feel alive: `hover:shadow-xl hover:-translate-y-1 transition-all duration-300`

**Example (A standard content block):**

```
tsx

<divclassName="bg-white p-8 rounded-2xl shadow-md border-0 flex flex-col gap-4">
{/* Content goes here */}
</div>
```

## **3. Vibrant Gradient Buttons (Call to Actions)**

**Principle:** Primary actions should be unmistakable and feel premium. Use vivid color gradients instead of flat brand colors.

- **Primary Action (Playful/Creative):** `bg-gradient-to-r from-orange-500 to-rose-500 text-white`
- **Admin/System Action:** `bg-gradient-to-r from-indigo-500 to-purple-600 text-white`
- **Success/Approval:** `bg-gradient-to-r from-emerald-500 to-teal-500 text-white`
- **Button Structure:** `py-3 px-6 rounded-xl font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all`

**Example (A primary interactive button):**

```
tsx

<buttonclassName="w-full bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold py-3 px-6 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
    Generate Story
</button>
```

## **4. Modern Input Fields**

**Principle:** Form inputs should be distinctly interactive but soft. They should have ample padding and clear focus states.

- **Input Base:** `w-full p-3 md:p-4 border border-gray-200 rounded-xl bg-gray-50 hover:bg-white transition-all`
- **Focus State:** `focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none`

## **5. Typography block formatting**

**Principle:** Maintain hierarchy. Distinctly separate labels, titles, and body copy using font weights and tracking (letter spacing).

- **Page Titles:** `text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight`
- **Section Headers:** `text-2xl font-bold text-gray-800`
- **Small Labels/Badges (eyebrow text):** `text-xs font-black tracking-widest text-indigo-500 uppercase`
- **Reading Text (Story Mode):** `text-lg md:text-xl text-gray-800 leading-relaxed font-serif`

## **6. Layout strategy (Side-by-Side)**

**Principle:** Maximize screen real estate on desktop viewing by moving away from top-to-bottom long scrolls. Use CSS Grids or Flexbox to place related functional areas adjacent to each other.

- **Grid Layout (50/50 split):** `grid grid-cols-1 md:grid-cols-2 gap-8`
- **Flex Layout (Sidebar + Main Content):** `flex flex-col md:flex-row gap-6 md:gap-8`

**Example (Side-by-side editing interface):**

```
tsx

<divclassName="grid grid-cols-1 md:grid-cols-2 gap-8">
<divclassName="bg-white p-8 rounded-2xl shadow-md">
{/* Left Side: Parameters / Form */}
</div>
<divclassName="bg-gray-50 p-8 rounded-2xl shadow-inner border border-gray-100">
{/* Right Side: Preview / JSON Output */}
</div>
</div>
```

## **7. Subtle Touches**

- **Icons:** Use Lucide React icons (`lucide-react`) colored to match the primary gradients (e.g., `text-indigo-500`).
- **Glassmorphism (Headers):** Instead of solid white headers, use blurry translucent headers that let the background peek through on scroll: `bg-white/80 backdrop-blur-md sticky top-0 z-50`.