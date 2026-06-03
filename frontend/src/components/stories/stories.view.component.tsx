import React, { useEffect, useState, useRef, useMemo } from "react";
import { getShortenedText, ITopicData, topicsData, getWordCount, SELECTED_TOPIC_CLASSES } from "./stories.utils";
import { formatReadingStats } from "../../utils/story-utils";
import toast, { Toaster } from "react-hot-toast";
import { useCreatePostMutation, useDeletePostMutation } from "../../redux/apis/post.api";
import { useGetProfileInfoQuery } from "../../redux/apis/user.api";
import jsPDF from "jspdf";
import StoryWorldMap from "../story-map/StoryWorldMap";
import StoryRemix from "../remix/StoryRemix";
import BookmarkButton from "../BookmarkButton";
import logo from "../../assets/logoNew.png";
import StoryGeneratingAnimation from "../loading/story-generating-animation.component";
import AudioPlayer, { type AudioPlayerHandle, type NarrationPlaybackState } from "../AudioPlayer";
import { useLocation, useNavigate } from "react-router-dom";
import {
  useGenerateAlternateEndingsMutation,
  useGenerateFreeAlternateEndingsMutation,
} from "../../redux/apis/ai.model.api";
import StoryVisualizer from "../story-visualizer/StoryVisualizer";
import StoryTranslator from "../translate/StoryTranslator";
import StoryCoverImage from "./StoryCoverImage";
import { useDispatch } from "react-redux";
import { setStory } from "../../redux/slices/storySlice";
import ContinueStoryButton from "../story/ContinueStoryButton";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "The AI service is currently busy. Please wait a moment and try again.";
    }
    if ([502, 503, 504].includes(error.status)) {
      return "The server took too long to respond. Please try again shortly.";
    }
    if (error.status >= 500) {
      return "A server error occurred. Please try again later.";
    }
  }

  if (error instanceof TypeError) {
    return "Could not reach the server. Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

export interface IStories {
  uuid: string;
  title: string;
  content: string;
  tag: string;
  imageURL: string;
  language?: string;
  emotions?: string[];
  enhancedPrompt?: string;
}

export interface IPost extends IStories {
  topic: ITopicData[];
  isPublished?: boolean;
}

interface StoriesComponentProps {
  stories: IStories[];
  isLogin: boolean;
  setStories: (stories: IStories[]) => void;
  onPublishSuccess?: () => void;
  isLoading?: boolean;
}

interface IRelatedStoriesComponentProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  posts: any[];
  currentPostId: string;
}

type StorySentenceSegment = {
  id: string;
  text: string;
  startWordIndex: number;
  endWordIndex: number;
};

const buildSentenceSegments = (content: string): StorySentenceSegment[] => {
  if (!content.trim()) {
    return [];
  }

  const sentenceMatches = content.match(/[^.!?]+[.!?]*\s*/g) ?? [content];
  const segments: StorySentenceSegment[] = [];
  let wordCursor = 0;

  sentenceMatches.forEach((sentence, index) => {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) {
      return;
    }

    const wordsInSentence = sentence.match(/\S+/g)?.length ?? 0;
    const startWordIndex = wordCursor;
    const endWordIndex =
      wordsInSentence > 0 ? wordCursor + wordsInSentence - 1 : wordCursor;

    segments.push({
      id: `${index}-${startWordIndex}-${endWordIndex}`,
      text: sentence,
      startWordIndex,
      endWordIndex,
    });

    wordCursor += wordsInSentence;
  });

  return segments;
};

const getSafeFileName = (title: string, extension: "md" | "docx"): string => {
  const safeTitle = (title || "story")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return `${safeTitle || "story"}.${extension}`;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const createDocxBlob = ({
  title,
  content,
  tag,
  author,
}: {
  title: string;
  content: string;
  tag: string;
  author: string;
}): Blob => {
  const paragraphs = content
    .split(/\n+/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #111827; }
    h1 { color: #312e81; }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Tag: ${escapeHtml(tag)} | Author: ${escapeHtml(author)}</div>
  ${paragraphs}
</body>
</html>`;

  return new Blob([html], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8",
  });
};

export const RelatedStoriesComponent: React.FC<IRelatedStoriesComponentProps> = ({
  posts,
  currentPostId,
}) => {
  const navigate = useNavigate();
  const filteredPosts = posts ? posts.filter((post) => post._id !== currentPostId) : [];

  return (
    <div className="mt-8">
      <h4 className="text-lg font-bold text-slate-200 mb-4">Related Content</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredPosts.map((post) => (
          <div
            key={post._id}
            onClick={() => navigate(`/stories/${post._id}`)}
            className="p-4 bg-slate-700/40 rounded-xl border border-slate-600/30 cursor-pointer hover:bg-slate-700/60 transition-colors"
          >
            <p className="text-sm font-semibold text-white truncate">{post.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const StoriesViewComponent: React.FC<StoriesComponentProps> = ({
  stories,
  isLogin,
  setStories,
  onPublishSuccess,
  isLoading,
}) => {
  const location = useLocation();
  const dispatch = useDispatch();
  const audioPlayerRef = useRef<AudioPlayerHandle>(null);
  
  const [selectedStory, setSelectedStory] = useState<IStories | null>(null);
  const [topics, setTopics] = useState<ITopicData[]>(topicsData);
  const [selectTopics, setSelectTopics] = useState<ITopicData[]>([]);
  const [newTopicTitle, setNewTopicTitle] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  
  const [showWorldMap, setShowWorldMap] = useState<boolean>(false);
  const [showRemix, setShowRemix] = useState<boolean>(false);
  const [showTranslator, setShowTranslator] = useState<boolean>(false);
  const [showStoryVisualizer, setShowStoryVisualizer] = useState<boolean>(false);

  const [endingsCache, setEndingsCache] = useState<{
    [uuid: string]: { style: string; ending: string; fullStory: string }[];
  }>({});
  const [originalStoryContent, setOriginalStoryContent] = useState<{
    [uuid: string]: string;
  }>({});

  const [isGeneratingEndings, setIsGeneratingEndings] = useState<boolean>(false);
  const [activeEndingTab, setActiveEndingTab] = useState<string>("Happy Ending");
  const [narrationWordIndex, setNarrationWordIndex] = useState<number>(0);
  const [narrationState, setNarrationState] = useState<NarrationPlaybackState>("idle");
  const [readingStreak, setReadingStreak] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const storyboardScenes: any[] = [];
  const storyboardStyleGuide = "";

  const lastSavedContentRef = useRef<string>("");
  const isSavingRef = useRef<boolean>(false);
  const hasSavedSessionRef = useRef<boolean>(false);
  const savedPostIdRef = useRef<string | null>(null);

  const [createPost] = useCreatePostMutation();
  const [deletePost] = useDeletePostMutation();
  const { data: profile } = useGetProfileInfoQuery();
  const [generateAlternateEndings] = useGenerateAlternateEndingsMutation();
  const [generateFreeAlternateEndings] = useGenerateFreeAlternateEndingsMutation();

  const clearError = () => setError(null);

  useEffect(() => {
    if (selectedStory && !originalStoryContent[selectedStory.uuid]) {
      setOriginalStoryContent((prev) => ({
        ...prev,
        [selectedStory.uuid]: selectedStory.content,
      }));
    }
  }, [selectedStory, originalStoryContent]);

  useEffect(() => {
    if (selectedStory) {
      const todayStr = new Date().toDateString();
      const lastReadDate = localStorage.getItem("lastReadDate");
      const streak = Number(localStorage.getItem("readingStreak") || "0");

      if (lastReadDate !== todayStr) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();

        let newStreak = 1;
        if (lastReadDate === yesterdayStr) {
          newStreak = streak + 1;
        }

        localStorage.setItem("readingStreak", String(newStreak));
        localStorage.setItem("lastReadDate", todayStr);
        setReadingStreak(newStreak);
      } else {
        setReadingStreak(streak);
      }
    }
  }, [selectedStory]);

  useEffect(() => {
    setSelectTopics(topics.filter((topic) => topic.selected));
  }, [topics]);

  useEffect(() => {
    const player = audioPlayerRef.current;
    return () => {
      player?.stop();
    };
  }, [location.pathname]);

  useEffect(() => {
    setNarrationWordIndex(0);
    setNarrationState("idle");
  }, [selectedStory?.uuid]);

  const sentenceSegments = useMemo(() => {
    return buildSentenceSegments(selectedStory?.content ?? "");
  }, [selectedStory?.content]);

  useEffect(() => {
    if (stories && stories.length > 0) {
      setSelectedStory(stories[0]);
      dispatch(setStory({
        id: stories[0].uuid,
        title: stories[0].title,
        chapters: [{ id: 1, title: "Chapter 1", content: stories[0].content, createdAt: new Date().toISOString() }],
      }));
    } else {
      setSelectedStory(null);
    }
    lastSavedContentRef.current = "";
    hasSavedSessionRef.current = false;
    savedPostIdRef.current = null;
  }, [stories, dispatch]);

  useEffect(() => {
    const autoSaveStory = async () => {
      if (!isLogin || !selectedStory) return;
      if (selectedStory.content === lastSavedContentRef.current) return;
      if (hasSavedSessionRef.current) return;
      if (isSavingRef.current) return;

      isSavingRef.current = true;

      const post: IPost = {
        ...selectedStory,
        topic: selectTopics,
        isPublished: false,
      };

      try {
        const result = await createPost(post).unwrap();
        if (result && result.data && result.data._id) {
          savedPostIdRef.current = result.data._id;
        }

        lastSavedContentRef.current = selectedStory.content;
        hasSavedSessionRef.current = true;
        toast.success("Story auto-saved!");
      } catch (error) {
        console.error("Auto-save failed", error);
      } finally {
        isSavingRef.current = false;
      }
    };

    const timer = setTimeout(() => {
      autoSaveStory();
    }, 1000);

    return () => clearTimeout(timer);
  }, [selectedStory, selectedStory?.content, isLogin, selectTopics, createPost]);

  const handelStorySelection = (story: IStories) => {
    setSelectedStory(story);
  };

  const handleTopicClick = (index: number) => {
    setTopics((currentTopics) =>
      currentTopics.map((topic, topicIndex) =>
        topicIndex === index ? { ...topic, selected: !topic.selected } : topic
      )
    );
  };

  const handleAddTopic = () => {
    const title = newTopicTitle.trim();
    if (!title) {
      toast.error("Please enter a topic.");
      return;
    }
    const normalizedTitle = title.startsWith("#") ? title : `#${title}`;
    const topicExists = topics.some(
      (topic) => topic.title.toLowerCase() === normalizedTitle.toLowerCase()
    );
    if (topicExists) {
      toast.error("This topic already exists.");
      return;
    }
    setTopics((currentTopics) => [
      ...currentTopics,
      {
        title: normalizedTitle,
        className: SELECTED_TOPIC_CLASSES,
        color: SELECTED_TOPIC_CLASSES,
        selected: true,
      },
    ]);
    setNewTopicTitle("");
  };

  const handleRemoveTopic = (index: number) => {
    if (topics.length <= 2) {
      toast.error("At least 2 topics are required.");
      return;
    }
    setTopics((currentTopics) =>
      currentTopics.filter((_, topicIndex) => topicIndex !== index)
    );
  };

  const handleCopyStory = async () => {
    if (selectedStory?.content) {
      await navigator.clipboard.writeText(selectedStory.content);
      setIsCopied(true);
      toast.success("Story copied!");
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleExportPDF = async () => {
    if (!selectedStory) {
      toast.error("No story available to export.");
      return;
    }

    if (!selectedStory.content?.trim()) {
      toast.error("Story content is empty. Cannot export.");
      return;
    }

    const toastId = toast.loading("Preparing your premium PDF...");

    try {
      const loadImageWithTimeout = (src: string, timeoutMs: number = 3000): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";

          const timeout = setTimeout(() => {
            img.src = "";
            reject(new Error(`Timeout loading image: ${src}`));
          }, timeoutMs);

          img.onload = () => {
            clearTimeout(timeout);
            resolve(img);
          };
          img.onerror = (e) => {
            clearTimeout(timeout);
            reject(e);
          };

          img.src = src;
        });
      };

      let logoImg: HTMLImageElement | null = null;
      let storyImg: HTMLImageElement | null = null;

      try {
        logoImg = await loadImageWithTimeout(logo);
      } catch (err) {
        console.warn("Failed to load StorySparkAI logo for PDF", err);
      }

      if (selectedStory.imageURL) {
        try {
          storyImg = await loadImageWithTimeout(selectedStory.imageURL);
        } catch (err) {
          console.warn("Failed to load story banner image for PDF", err);
        }
      }

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const title = selectedStory.title || "Untitled Story";
      const content = selectedStory.content || "";
      const tag = (selectedStory.tag || "STORY").toUpperCase();

      const leftMargin = 20;
      const rightMargin = 20;
      const topMargin = 20;
      const bottomMargin = 20;
      const printableWidth = 210 - leftMargin - rightMargin; // 170 mm
      const maxY = 297 - bottomMargin - 10;

      let yCursor = topMargin;

      if (logoImg) {
        const logoHeight = 8;
        const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
        doc.addImage(logoImg, "PNG", leftMargin, yCursor, logoWidth, logoHeight);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(99, 102, 241); // Brand Indigo
        doc.text("StorySparkAI", leftMargin, yCursor + 6);
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("PREMIUM AI GENERATED STORY", 190, yCursor + 5, { align: "right" });

      yCursor += 10;

      doc.setDrawColor(99, 102, 241);
      doc.setLineWidth(0.5);
      doc.line(leftMargin, yCursor, 190, yCursor);

      yCursor += 8;

      if (storyImg) {
        const bannerHeight = 55;
        doc.addImage(storyImg, "JPEG", leftMargin, yCursor, printableWidth, bannerHeight);
        yCursor += bannerHeight + 8;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59);
      const splitTitle = doc.splitTextToSize(title, printableWidth);
      splitTitle.forEach((line: string) => {
        doc.text(line, leftMargin, yCursor);
        yCursor += 9;
      });

      yCursor += 1;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      const formattedDate = new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      doc.text(`Generated on ${formattedDate}`, leftMargin, yCursor);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      const tagWidth = doc.getTextWidth(tag);
      const chipWidth = tagWidth + 5;
      const chipHeight = 5;
      const chipX = 190 - chipWidth;
      const chipY = yCursor - 3.8;

      doc.setFillColor(99, 102, 241);
      doc.roundedRect(chipX, chipY, chipWidth, chipHeight, 1, 1, "F");

      doc.setTextColor(255, 255, 255);
      doc.text(tag, chipX + 2.5, chipY + 3.5);

      yCursor += 4.5;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(leftMargin, yCursor, 190, yCursor);

      yCursor += 10;

      const paragraphs = content.split(/\n+/);
      const lineHeight = 6.5;
      const paragraphSpacing = 4.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);

      paragraphs.forEach((para: string, pIdx: number) => {
        const cleanPara = para.trim();
        if (!cleanPara) return;

        const lines = doc.splitTextToSize(cleanPara, printableWidth);
        lines.forEach((line: string) => {
          if (yCursor > maxY) {
            doc.addPage();
            yCursor = 30;
          }
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          doc.setTextColor(30, 41, 59);
          doc.text(line, leftMargin, yCursor);
          yCursor += lineHeight;
        });

        if (pIdx < paragraphs.length - 1) {
          yCursor += paragraphSpacing;
        }
      });

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.25);
        doc.line(leftMargin, 280, 190, 280);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("Generated with StorySparkAI", leftMargin, 285);
        doc.text(`Page ${i} of ${totalPages}`, 190, 285, { align: "right" });

        if (i > 1) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(99, 102, 241);
          doc.text("StorySparkAI", leftMargin, 14);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          const headerTitle = title.length > 50 ? title.substring(0, 50) + "..." : title;
          doc.text(headerTitle, 190, 14, { align: "right" });

          doc.setDrawColor(241, 245, 249);
          doc.setLineWidth(0.2);
          doc.line(leftMargin, 17, 190, 17);
        }
      }

      const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      doc.save(`${safeTitle}.pdf`);
      toast.dismiss(toastId);
      toast.success("Premium PDF downloaded!");
    } catch (error) {
      console.error(error);
      toast.dismiss(toastId);
      toast.error("Failed to export PDF.");
    }
  };

  const handleExportMarkdown = () => {
    if (!selectedStory) {
      toast.error("No story available to export.");
      return;
    }
    if (!selectedStory.content?.trim()) {
      toast.error("Story content is empty. Cannot export.");
      return;
    }

    try {
      const title = selectedStory.title || "Story";
      const content = selectedStory.content || "";
      const tag = selectedStory.tag || "General";
      const authorName = isLogin && profile?.name ? profile.name : "Anonymous";
      const isoDate = new Date().toISOString().split("T")[0];
      const markdownContent = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ntag: "${tag.replace(/"/g, '\\"')}"\nauthor: "${authorName.replace(/"/g, '\\"')}"\ndate: "${isoDate}"\n---\n\n# ${title}\n\n${content}\n`;
      const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8;" });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "story"}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Markdown downloaded!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export Markdown.");
    }
  };

  const handleExportDOCX = () => {
    if (!selectedStory) {
      toast.error("No story available to export.");
      return;
    }
    if (!selectedStory.content?.trim()) {
      toast.error("Story content is empty. Cannot export.");
      return;
    }
    try {
      const title = selectedStory.title || "Untitled Story";
      const docxBlob = createDocxBlob({
        title,
        content: selectedStory.content || "",
        tag: selectedStory.tag || "Story",
        author: isLogin && profile?.name ? profile.name : "Anonymous",
      });
      downloadBlob(docxBlob, getSafeFileName(title, "docx"));
      toast.success("DOCX downloaded!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export DOCX.");
    }
  };

  const handleGenerateAlternateEndings = async () => {
    if (!selectedStory) return;
    clearError();
    setIsGeneratingEndings(true);
    const toastId = toast.loading("Generating alternate endings...");
    try {
      const payload = {
        title: selectedStory.title,
        content: originalStoryContent[selectedStory.uuid] || selectedStory.content,
        tag: selectedStory.tag,
        language: selectedStory.language || "English",
      };
      
      const generationRequest = isLogin
        ? generateAlternateEndings(payload)
        : generateFreeAlternateEndings(payload);
        
      const res = await generationRequest.unwrap();
      
      if (!res || !Array.isArray(res.data)) {
        throw new Error("Unexpected response format from the AI service.");
      }
      
      setEndingsCache((prev) => ({ ...prev, [selectedStory.uuid]: res.data }));
      toast.success("Alternate endings generated successfully!");
    } catch (err: any) {
      console.error("[StoriesView Alternate Ending Flow Failure]:", err);
      const errorStatus = err?.status || err?.data?.status;
      if (errorStatus) {
        setError(getErrorMessage(new ApiError(errorStatus, err?.data?.message || "")));
      } else {
        setError(getErrorMessage(err));
      }
      toast.error("Failed to generate alternate endings.");
    } finally {
      toast.dismiss(toastId);
      setIsGeneratingEndings(false);
    }
  };

  const handleApplyEnding = (endingData: { style: string; ending: string; fullStory: string }) => {
    if (!selectedStory) return;
    const updatedStory = { ...selectedStory, content: endingData.fullStory };
    setSelectedStory(updatedStory);
    setStories(stories.map((s) => (s.uuid === selectedStory.uuid ? updatedStory : s)));
    toast.success(`${endingData.style} applied to story!`);
  };

  const handleResetEnding = () => {
    if (!selectedStory) return;
    const originalContent = originalStoryContent[selectedStory.uuid];
    if (!originalContent) return;
    const updatedStory = { ...selectedStory, content: originalContent };
    setSelectedStory(updatedStory);
    setStories(stories.map((s) => (s.uuid === selectedStory.uuid ? updatedStory : s)));
    toast.success("Reverted to original story ending!");
  };

  const handelPublishStory = async () => {
    if (!isLogin) {
      toast.error("Please login to publish the story.");
      return;
    }
    if (!selectedStory) {
      toast.error("No story available. Please generate a story first.");
      return;
    }
    if (selectTopics.length < 2) {
      toast.error("Please select at least 2 topics.");
      return;
    }
    const post: IPost = {
      ...selectedStory,
      topic: selectTopics,
      isPublished: true,
    };
    setLoading(true);
    try {
      if (savedPostIdRef.current) {
        try {
          await deletePost(savedPostIdRef.current).unwrap();
        } catch (deleteError) {
          console.warn("Failed to delete draft:", deleteError);
        }
      }
      const result = await createPost(post).unwrap();
      if (result) {
        toast.success("Story published successfully!");
        setStories([]);
        setSelectedStory(null);
        onPublishSuccess?.();
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const calculateReadingTime = (content: string): number => {
    const words = getWordCount(content);
    return Math.max(1, Math.ceil(words / 200));
  };

  const isNarrationActive = narrationState !== "idle";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <StoryGeneratingAnimation />
      </div>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <div className="w-full text-center text-slate-400 dark:text-slate-500 py-16">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 text-sm font-medium">
          No stories generated yet. Start by entering a prompt ✨
        </div>
      </div>
    );
  }

  if (!selectedStory) {
    return null;
  }

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pt-8 pb-16 relative overflow-hidden box-border">
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none select-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none select-none" />

      <style>
        {`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up {
            animation: fadeInUp 0.6s ease-out forwards;
          }
        `}
      </style>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start relative z-10 w-full box-border animate-fade-in-up">
        
        {/* ── Left Column ── */}
        <div className="col-span-1 lg:col-span-8 flex flex-col space-y-6 w-full box-border">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 w-full box-border border-b border-slate-200/60 dark:border-white/5 pb-6">
            <div className="text-left">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
                {selectedStory.title}
              </h1>

              <div className="flex flex-wrap gap-2 select-none">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500/5 text-blue-600 dark:text-blue-400 border border-blue-500/10 py-1 px-3 text-xs font-bold uppercase tracking-wider shadow-sm">
                  🎭 {selectedStory.tag}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-purple-500/5 text-purple-600 dark:text-purple-400 border border-purple-500/10 py-1 px-3 text-xs font-bold uppercase tracking-wider shadow-sm">
                  🌐 {selectedStory.language || "English"}
                </span>

                {selectedStory.emotions && selectedStory.emotions.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 py-1 px-3 text-xs font-bold uppercase tracking-wider shadow-sm">
                    😊 {selectedStory.emotions.join(", ")}
                  </span>
                )}
              </div>
            </div>

            {/* Story selector thumbnails */}
            <div className="flex justify-start sm:justify-end shrink-0 select-none">
              <div className="flex -space-x-4">
                {stories.map((story) => (
                  <button
                    key={story.uuid}
                    className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 ${
                      selectedStory.uuid === story.uuid ? "border-blue-600 scale-110 z-10 shadow-md" : "border-white dark:border-slate-800"
                    } hover:scale-110 hover:z-10 transition-all duration-150 focus:outline-none overflow-hidden cursor-pointer`}
                    onClick={() => handelStorySelection(story)}
                    title={story.title}
                  >
                    <StoryCoverImage
                      title={story.title}
                      tag={story.tag}
                      size="thumb"
                      style={{ width: "100%", height: "100%" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Story content card */}
          <div className="bg-white dark:bg-[#111827]/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm w-full box-border text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-white/5 select-none">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Workspace Blueprint</h3>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="rounded-xl px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 border border-slate-200/60 dark:border-transparent text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-[0.98] cursor-pointer" onClick={handleCopyStory} disabled={!selectedStory}>
                  {isCopied ? "✓ Copied" : "📋 Copy"}
                </button>
                <button type="button" className="rounded-xl px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 border border-slate-200/60 dark:border-transparent text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-[0.98] cursor-pointer" onClick={handleExportPDF} disabled={!selectedStory}>
                  📄 PDF
                </button>
                <button type="button" className="rounded-xl px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 border border-slate-200/60 dark:border-transparent text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-[0.98] cursor-pointer" onClick={handleExportMarkdown} disabled={!selectedStory}>
                  ⬇️ Markdown
                </button>
                <button type="button" className="rounded-xl px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 border border-slate-200/60 dark:border-transparent text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-[0.98] cursor-pointer" onClick={handleExportDOCX} disabled={!selectedStory}>
                  📝 DOCX
                </button>
                <button type="button" className="rounded-xl px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 border border-slate-200/60 dark:border-transparent text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-[0.98] cursor-pointer" onClick={() => setShowWorldMap(true)} disabled={!selectedStory}>
                  🗺️ Map
                </button>
                <button type="button" className="rounded-xl px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 border border-slate-200/60 dark:border-transparent text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-[0.98] cursor-pointer" onClick={() => setShowRemix(true)} disabled={!selectedStory}>
                  🔀 Remix
                </button>
                <button type="button" className="rounded-xl px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 border border-slate-200/60 dark:border-transparent text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-[0.98] cursor-pointer" onClick={() => setShowTranslator(true)} disabled={!selectedStory}>
                  🌍 Translate
                </button>
                <button
                  type="button"
                  id="publish-story-btn"
                  className="rounded-xl px-4 py-2 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer bg-blue-600 hover:bg-blue-500 text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handelPublishStory}
                  disabled={loading || !selectedStory}
                >
                  {loading ? "Publishing..." : "Publish"}
                </button>
              </div>
            </div>

            {selectedStory.enhancedPrompt && (
              <div className="mb-6 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                <h4 className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider flex items-center gap-2 select-none">
                  <i className="fas fa-wand-magic-sparkles"></i> AI Enhanced Prompt
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm italic break-words whitespace-pre-wrap m-0 leading-relaxed font-medium">
                  {selectedStory.enhancedPrompt}
                </p>
              </div>
            )}

            <div id="story-content" className="w-full text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed tracking-wide font-medium">
              <p className="break-words whitespace-pre-wrap m-0">
                {sentenceSegments.length > 0 ? (
                  sentenceSegments.map((segment: StorySentenceSegment) => {
                    const isActiveSentence = isNarrationActive && narrationWordIndex >= segment.startWordIndex && narrationWordIndex <= segment.endWordIndex;
                    const rawParts = segment.text.split(/(\s+)/);
                    let wordOffset = 0;

                    return (
                      <span
                        key={segment.id}
                        className={
                          isActiveSentence
                            ? "rounded-lg bg-blue-500/10 dark:bg-blue-500/20 px-1 py-0.5 text-slate-900 dark:text-white font-semibold transition-all"
                            : undefined
                        }
                      >
                        {rawParts.map((part, partIdx) => {
                          if (part === "") return null;
                          if (/^\s+$/.test(part)) {
                            return part;
                          }

                          const absoluteWordIndex = segment.startWordIndex + wordOffset;
                          wordOffset++;

                          const isActiveWord = isNarrationActive && narrationWordIndex === absoluteWordIndex;

                          if (isActiveWord) {
                            return (
                              <span
                                key={partIdx}
                                className="bg-indigo-500/20 text-indigo-300 rounded px-0.5 transition-all duration-150"
                              >
                                {part}
                              </span>
                            );
                          }

                          return <span key={partIdx}>{part}</span>;
                        })}
                      </span>
                    );
                  })
                ) : (
                  (() => {
                    const rawParts = selectedStory.content.split(/(\s+)/);
                    let wordOffset = 0;
                    return rawParts.map((part, partIdx) => {
                      if (part === "") return null;
                      if (/^\s+$/.test(part)) {
                        return part;
                      }

                      const absoluteWordIndex = wordOffset;
                      wordOffset++;

                      const isActiveWord = isNarrationActive && narrationWordIndex === absoluteWordIndex;

                      if (isActiveWord) {
                        return (
                          <span
                            key={partIdx}
                            className="bg-indigo-500/20 text-indigo-300 rounded px-0.5 transition-all duration-150"
                          >
                            {part}
                          </span>
                        );
                      }

                      return <span key={partIdx}>{part}</span>;
                    });
                  })()
                )}
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5 w-full box-border">
              <AudioPlayer
                ref={audioPlayerRef}
                text={selectedStory.content}
                title={selectedStory.title}
                onWordIndexChange={setNarrationWordIndex}
                onPlaybackStateChange={setNarrationState}
              />
            </div>
            <div className="mt-4 w-full box-border">
              <ContinueStoryButton />
            </div>
          </div>

          {/* Topics management section */}
          <div className="bg-white dark:bg-[#111827]/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 p-5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm w-full box-border text-left">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4 select-none">Categorization Indexes</h3>
            <div className="flex flex-col sm:flex-row gap-3 mb-5 select-none w-full box-border">
              <input
                type="text"
                value={newTopicTitle}
                onChange={(event) => setNewTopicTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddTopic();
                  }
                }}
                placeholder="Add contextual keyword index tag..."
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-950/60 px-4 py-2 text-xs sm:text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-500/40 focus:outline-none transition-colors"
              />
              <button type="button" className="rounded-xl px-4 py-2.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold uppercase tracking-wider hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors active:scale-[0.98] cursor-pointer" onClick={handleAddTopic}>
                Add Tag
              </button>
            </div>
            <div className="flex flex-wrap gap-2 w-full box-border">
              {topics.map((topic, index) => (
                <span key={index} className={`inline-flex items-center gap-2 px-3 py-1.5 ${topic.className} rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm border border-slate-100 dark:border-transparent select-none`}>
                  <button type="button" className="cursor-pointer font-bold uppercase flex items-center gap-1.5" onClick={() => { handleTopicClick(index); }}>
                    {topic.selected ? <i className="fa-solid fa-check" /> : <i className="fa-solid fa-plus" />}{topic.title}
                  </button>
                  <button type="button" className="cursor-pointer border-l border-current/20 pl-2 opacity-50 hover:opacity-100 disabled:cursor-not-allowed" onClick={() => handleRemoveTopic(index)} disabled={topics.length <= 2} aria-label={`Remove ${topic.title}`}>
                    <i className="fa-solid fa-xmark" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Alternate endings control hub */}
          <div className="bg-white dark:bg-[#111827]/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm w-full box-border text-left relative overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 select-none w-full box-border">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Narrative Path Modifications</h3>
                <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mt-1.5">Branch out into unique storytelling variations.</p>
              </div>
              {selectedStory.content !== originalStoryContent[selectedStory.uuid] && (
                <button type="button" onClick={handleResetEnding} className="w-full sm:w-auto rounded-xl px-3.5 py-2 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/10 text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5">
                  <i className="fa-solid fa-rotate-left" /> Revert to Original
                </button>
              )}
            </div>

            {isGeneratingEndings ? (
              <div className="flex flex-col items-center justify-center py-12 select-none w-full">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-blue-600 dark:border-white/10 dark:border-t-white mb-4"></div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 animate-pulse">Running variant projection logic...</p>
              </div>
            ) : endingsCache[selectedStory.uuid]?.length > 0 ? (
              <div className="w-full box-border">
                <div className="flex border-b border-slate-100 dark:border-white/5 mb-5 overflow-x-auto whitespace-nowrap scrollbar-none select-none w-full box-border">
                  {["Happy Ending", "Dark Ending", "Plot Twist Ending", "Open Ending", "Cliffhanger Ending"].map((name) => {
                    const endingData = (endingsCache[selectedStory.uuid] || []).find((e) => e.style === name);
                    const isApplied = endingData && selectedStory.content === endingData.fullStory;
                    return (
                      <button key={name} type="button" onClick={() => setActiveEndingTab(name)}
                        className={`px-4 py-2.5 font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${activeEndingTab === name ? "border-blue-600 text-blue-600 dark:border-white dark:text-white bg-slate-50 dark:bg-white/5 rounded-t-xl" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}>
                        <span>{name}</span>
                        {isApplied && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const currentEndingData = (endingsCache[selectedStory.uuid] || []).find((e) => e.style === activeEndingTab);
                  if (!currentEndingData) return null;
                  const isCurrentlyApplied = selectedStory.content === currentEndingData.fullStory;
                  return (
                    <div className="bg-slate-50/50 dark:bg-slate-950/30 rounded-xl p-5 border border-slate-200/60 dark:border-white/5 w-full box-border">
                      <div className="flex justify-between items-center mb-4 select-none w-full box-border">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{activeEndingTab} Excerpt</h4>
                        <div>
                          {isCurrentlyApplied ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                              <i className="fa-solid fa-circle-check" /> Active Node
                            </span>
                          ) : (
                            <button type="button" onClick={() => handleApplyEnding(currentEndingData)} className="rounded-xl px-3.5 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold uppercase tracking-wider hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:scale-[0.98] cursor-pointer shadow-sm">
                              Apply Branch
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-4 w-full box-border">
                        <div className="bg-white dark:bg-[#111827]/40 p-4 rounded-xl border border-slate-200/80 dark:border-white/5 leading-relaxed text-slate-600 dark:text-slate-300 text-xs sm:text-sm italic shadow-inner whitespace-pre-wrap text-left font-medium">
                          <p className="m-0">"{currentEndingData.ending}"</p>
                        </div>
                        <details className="group border border-slate-200/80 dark:border-white/5 rounded-xl overflow-hidden bg-white dark:bg-transparent">
                          <summary className="list-none flex items-center justify-between p-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer select-none">
                            <span>Preview Integrated Compounded Chronicle</span>
                            <span className="transition-transform duration-150 group-open:rotate-180 text-[8px]">▼</span>
                          </summary>
                          <div className="p-4 border-t border-slate-200/60 dark:border-white/5 text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap text-left font-medium bg-slate-50/30 dark:bg-transparent">
                            {currentEndingData.fullStory}
                          </div>
                        </details>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 bg-slate-50/50 dark:bg-white/[0.01] border border-dashed border-slate-200 dark:border-white/5 rounded-xl select-none w-full box-border">
                <button type="button" onClick={handleGenerateAlternateEndings} className="rounded-xl px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold uppercase tracking-wider shadow-md shadow-blue-500/10 transition-all duration-150 hover:scale-105 active:scale-[0.98] flex items-center gap-2 cursor-pointer">
                  <i className="fa-solid fa-shuffle text-xs" /> Transform Endings
                </button>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed mt-3.5 text-center max-w-sm px-4">
                  Analyzes the current plot architecture to frame 5 distinct structural variations including Happy, Dark, Plot Twist, Open, and Cliffhanger resolutions.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column: Preview Panel ── */}
        <div className="col-span-1 lg:col-span-4 w-full box-border lg:sticky lg:top-6">
          <div className="mb-4 text-left select-none px-0.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Compilation Preview
            </h2>
          </div>
          <div className="bg-white dark:bg-[#111827]/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden group w-full box-border text-left">
            <div className="flex flex-col w-full box-border">
              <div className="relative p-3 overflow-hidden text-white w-full box-border" style={{ height: "192px" }}>
                <StoryCoverImage
                  title={selectedStory.title}
                  tag={selectedStory.tag}
                  className="transition-transform duration-500 group-hover:scale-[1.02]"
                  style={{ width: "100%", height: "100%", borderRadius: "1rem" }}
                />
              </div>

              <div className="p-5 sm:p-6 w-full box-border">
                <div className="flex justify-between items-center mb-4 w-full box-border select-none">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="inline-flex items-center rounded-lg bg-purple-500/10 border border-purple-500/10 py-1 px-2.5 text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                      {selectedStory.tag}
                    </div>
                    <div className="inline-flex items-center rounded-lg bg-blue-500/10 border border-blue-500/10 py-1 px-2.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                      {selectedStory.language || "English"}
                    </div>
                    <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-white/5 py-1 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 gap-1">
                      ⏱️ {calculateReadingTime(selectedStory.content)} Min Read
                    </div>
                  </div>
                  <div className="shrink-0"><BookmarkButton storyId={selectedStory.uuid} /></div>
                </div>
                <h3 className="mb-2 text-slate-900 dark:text-slate-200 text-lg sm:text-xl font-extrabold tracking-tight leading-snug">{selectedStory.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 font-medium break-words text-xs sm:text-sm leading-relaxed m-0">{getShortenedText(selectedStory.content)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showWorldMap && selectedStory && (
        <StoryWorldMap
          story={selectedStory.content}
          title={selectedStory.title}
          onClose={() => setShowWorldMap(false)}
        />
      )}

      {showRemix && selectedStory && (
        <StoryRemix
          story={selectedStory}
          isLogin={isLogin}
          onRemixComplete={(remixedStory) => {
            setStories([remixedStory, ...stories]);
            setSelectedStory(remixedStory);
            setShowRemix(false);
          }}
          onClose={() => setShowRemix(false)}
        />
      )}

      {showTranslator && selectedStory && (
        <StoryTranslator
          story={selectedStory}
          isLogin={isLogin}
          onClose={() => setShowTranslator(false)}
        />
      )}

      {showStoryVisualizer && storyboardScenes.length > 0 && (
        <StoryVisualizer
          title={selectedStory.title}
          scenes={storyboardScenes}
          styleGuide={storyboardStyleGuide}
          onClose={() => setShowStoryVisualizer(false)}
        />
      )}

      <Toaster position="top-right" reverseOrder={false} />
    </div>
  );
};

export default StoriesViewComponent;
