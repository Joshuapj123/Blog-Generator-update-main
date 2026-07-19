# API Requirements & Setup Guide

To power the retrieval and generation components of the **Content Assembly Engine**, you will need to provision API keys from the following services.

## 1. Google Gemini API (LLM Generation)
Used for all cognitive stages: categorizing the title, generating the outline, writing block schemas, and formulating the final output structure.

- **Setup Guide**: 
  1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
  2. Create a new API Key.
- **Environment Variable**: 
  ```env
  GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key_here
  ```

## 2. YouTube Data API v3 (Rich Media Retrieval)
Used to automatically find high-quality YouTube clips correlating with section topics and intents.

- **Setup Guide**:
  1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
  2. Create a new project or select an existing one.
  3. Navigate to **APIs & Services > Library** and search for "YouTube Data API v3".
  4. Enable the API.
  5. Go to **Credentials**, click **Create Credentials > API key**.
- **Environment Variable**:
  ```env
  YOUTUBE_API_KEY=your_youtube_api_key_here
  ```

## 3. Serper or Google Custom Search API (Web Retrieval)
Used to fetch external reference links to inject into the article (e.g., grounding statistics or related content).

- **Option A: Serper (Easier)**
  - Go to [Serper.dev](https://serper.dev/).
  - Create a free account and get an API key.
  - **Environment Variable**:
    ```env
    SERPER_API_KEY=your_serper_key_here
    ```

- **Option B: Google Programmable Search Engine**
  - Go to [Programmable Search Engine](https://programmablesearchengine.google.com/about/).
  - Create a new search engine and get the Search Engine ID (CX).
  - Go to [Google Cloud Console](https://console.cloud.google.com/), enable "Custom Search API" and get an API key.
  - **Environment Variables**:
    ```env
    GOOGLE_SEARCH_API_KEY=your_search_api_key
    GOOGLE_SEARCH_CX=your_cx_id
    ```
https://programmablesearchengine.google.com/controlpanel/searchfeatures?cx=826b32a5645d44275
> *Note: For this v1 implementation, we will utilize the Serper API configuration since it operates as a clean JSON REST endpoint perfect for fetching fast web citations.*
