# FRNDPLAY

FRNDPLAY is a real-time collaborative music queue built for shared environments like parties, dorms, kickbacks, road trips, and events.

Instead of one person controlling the music, FRNDPLAY allows everyone in the room to contribute to the queue, vote on songs, and interact live across devices in real time.

---

## Live Demo

🌐 https://frndplay.com

---

## Features

- Real-time shared music queue
- Create and join rooms instantly
- Live song voting system
- Queue reordering and host controls
- YouTube search integration
- Cross-device synchronization
- Mobile-responsive UI
- Seamless live updates without page refreshes
- Safe mode filtering toggle
- Broadcast playback sync controls

---

## Screenshots

### Landing Page
<img width="959" height="510" alt="image" src="https://github.com/user-attachments/assets/6cd66ddb-d435-4e88-8f12-67d3d8a60e81" />


### Live Room / Now Playing
<img width="960" height="540" alt="image" src="https://github.com/user-attachments/assets/b1726667-92c5-4605-97da-3f683007b248" />


### Queue Interaction
<img width="959" height="511" alt="image" src="https://github.com/user-attachments/assets/61f49740-5bbc-4756-bfb5-df8e6ae0cbf2" />


### Mobile Experience
<img width="250" height="512" alt="image" src="https://github.com/user-attachments/assets/a91966dc-9e41-44c6-ae9c-e967dc41f94c" />


### Mobile Queue & Controls
<img width="250" height="541" alt="image" src="https://github.com/user-attachments/assets/7b9d0e28-b6d2-4a3d-8baa-2b4a52186520" />
)

---

## Tech Stack

### Frontend
- React
- JavaScript
- Vite

### Backend / Services
- Supabase
- YouTube Data API
- PostHog Analytics

### Deployment
- Vercel

---

## Project Overview

FRNDPLAY was built to solve a simple but common problem:
music control in social environments usually depends on one device and one person.

The goal of the project was to create a lightweight platform where music becomes a shared, interactive experience instead of a one-person-controlled queue.

While building FRNDPLAY, I worked through:
- real-time state synchronization
- responsive mobile design
- API integrations
- deployment workflows
- production debugging
- live queue updates
- user experience optimization
- authentication and room management
- cross-device interaction handling

This project has been developed as a live production application with ongoing iteration and feature expansion.

---

## Current Status

The MVP is currently live and functional.

Current development focus includes:
- smarter recommendation systems
- improved moderation controls
- playlist persistence
- enhanced social features
- expanded queue intelligence

---

## Technical Challenges Solved

### Real-Time Synchronization
Implemented live queue updates across multiple users and devices without requiring page refreshes.

### Mobile Responsiveness
Optimized layouts and interactions across desktop and mobile devices to ensure a smooth user experience.

### Authentication & Room Flow
Built room creation/join functionality with persistent synchronization between users.

### API Integration
Integrated the YouTube Data API to allow dynamic song search and queue management directly inside the application.

### Deployment & Production Debugging
Managed deployment workflows and continuously debugged production issues related to authentication, playback syncing, and responsive layouts.

---

## Installation

Clone the repository:

```bash
git clone https://github.com/Keion1Dunlap/FRNDPLAY.git
cd FRNDPLAY
VITE_YOUTUBE_API_KEY=your_key_here
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
Author

Keion Dunlap

LinkedIn:https://www.linkedin.com/in/keion-dunlap-a01199283/
GitHub: https://github.com/Keion1Dunlap
