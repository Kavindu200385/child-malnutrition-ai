import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../App';
import { Lock, User as UserIcon, Heart, Users, Activity } from 'lucide-react';
import api from '../services/api';

interface LoginProps {
  onLogin: (user: User) => void;
}

// Background images array
const BACKGROUND_IMAGES = [
  'https://images.unsplash.com/photo-1604599730009-fe273616197c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGhjYXJlJTIwbW90aGVyJTIwYmFieSUyMGNsaW5pY3xlbnwxfHx8fDE3NzAwMTY2NTF8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
  'https://images.unsplash.com/photo-1758691462164-100b5e356169?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGlsZCUyMGhlYWx0aCUyMGNoZWNrdXAlMjBkb2N0b3J8ZW58MXx8fHwxNzcwMDE2NjUyfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
  'https://images.unsplash.com/photo-1594643781026-abcb610d394f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZWRpYXRyaWMlMjBudXRyaXRpb24lMjBtZWFzdXJlbWVudHxlbnwxfHx8fDE3NzAwMTY2NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
  'https://images.unsplash.com/photo-1610401162696-dad858f5b16d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtZWRpY2FsJTIwaGVhbHRoY2FyZSUyMHdvcmtlciUyMGJhYnl8ZW58MXx8fHwxNzcwMDE2NjUyfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
  'https://images.unsplash.com/photo-1616408621653-6755190009a3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGlsZHJlbiUyMGhlYWx0aCUyMGNsaW5pYyUyMGNhcmV8ZW58MXx8fHwxNzcwMDE2NjUzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
];

// Content variations for each background image
const CONTENT_VARIATIONS = [
  {
    headline: "Protecting Children's Health Through Early Detection",
    description: "A comprehensive digital system for Sri Lankan healthcare workers to monitor child nutrition, track growth patterns, and provide timely interventions using WHO standards.",
    features: [
      {
        icon: Activity,
        title: "WHO Growth Standards",
        description: "Real-time Z-score calculations and comprehensive growth tracking"
      },
      {
        icon: Heart,
        title: "Early Risk Prediction",
        description: "AI-powered forecasting to prevent malnutrition progression"
      },
      {
        icon: Users,
        title: "Clinical Recommendations",
        description: "Personalized guidance for every child's nutritional needs"
      }
    ]
  },
  {
    headline: "Comprehensive Health Screening for Every Child",
    description: "Empower healthcare professionals with advanced tools for systematic child health assessment, ensuring no child is left behind in nutritional care.",
    features: [
      {
        icon: Activity,
        title: "Digital Health Records",
        description: "Complete medical history tracking and growth monitoring at your fingertips"
      },
      {
        icon: Heart,
        title: "Risk Stratification",
        description: "Identify high-risk children requiring immediate attention and follow-up"
      },
      {
        icon: Users,
        title: "Family Engagement",
        description: "Share progress reports and nutritional guidance with parents"
      }
    ]
  },
  {
    headline: "Precision Growth Monitoring with WHO Standards",
    description: "Track every milestone with clinical accuracy. Our system integrates international growth standards to provide actionable insights for better child nutrition outcomes.",
    features: [
      {
        icon: Activity,
        title: "Longitudinal Growth Tracking",
        description: "Monitor developmental progress over time with comprehensive historical data"
      },
      {
        icon: Heart,
        title: "Growth Velocity Analysis",
        description: "Monitor growth trends and detect early signs of faltering growth"
      },
      {
        icon: Users,
        title: "Comparative Analytics",
        description: "Compare individual progress against WHO reference populations"
      }
    ]
  },
  {
    headline: "Evidence-Based Interventions at the Right Time",
    description: "From screening to treatment, streamline your workflow with clinical decision support that guides you through every step of malnutrition management.",
    features: [
      {
        icon: Activity,
        title: "Treatment Protocols",
        description: "Step-by-step guidance for SAM and MAM management based on guidelines"
      },
      {
        icon: Heart,
        title: "Referral Management",
        description: "Seamless coordination with specialized nutrition rehabilitation centers"
      },
      {
        icon: Users,
        title: "Progress Monitoring",
        description: "Track intervention outcomes and adjust treatment plans dynamically"
      }
    ]
  },
  {
    headline: "Strengthening Community Health Through Data",
    description: "Support population-level nutrition programs with comprehensive analytics. Make informed decisions to allocate resources where they're needed most.",
    features: [
      {
        icon: Activity,
        title: "District-Level Insights",
        description: "Aggregate data visualization for regional health planning"
      },
      {
        icon: Heart,
        title: "Epidemic Surveillance",
        description: "Early detection of malnutrition clusters and outbreak prevention"
      },
      {
        icon: Users,
        title: "Performance Metrics",
        description: "Monitor clinic efficiency and health worker productivity"
      }
    ]
  }
];

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Shuffle background images every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % BACKGROUND_IMAGES.length);
    }, 8000); // Change image every 8 seconds

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Call backend API for authentication
      const response = await api.post('/api/auth/login', {
        username: username.trim(),
        password: password,
      });

      if (response.data.status === 'success' && response.data.access_token) {
        // Store JWT token in localStorage
        localStorage.setItem('token', response.data.access_token);

        // Map backend user role to frontend role
        const backendUser = response.data.user;
        const frontendUser: User = {
          id: String(backendUser.id),
          username: backendUser.username,
          name: backendUser.name,
          role: backendUser.role as UserRole,
          clinic: backendUser.clinic || undefined,
          district: backendUser.district || undefined,
          is_protected: !!backendUser.is_protected,
          phm_area_id: backendUser.phm_area_id ?? undefined,
        };

        // Persist user so refresh keeps you logged in
        localStorage.setItem('user', JSON.stringify(frontendUser));

        onLogin(frontendUser);
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Login failed. Please check your credentials and try again.');
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Tablet/Mobile Background Image */}
      <div className="absolute inset-0 lg:hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('${BACKGROUND_IMAGES[currentImageIndex]}')`
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/35 via-blue-500/30 to-green-500/25" />
      </div>

      {/* Left Side - Background Image with Overlay */}
      <div className="hidden lg:flex lg:w-3/5 relative">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('${BACKGROUND_IMAGES[currentImageIndex]}')`
          }}
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/90 via-blue-500/80 to-green-500/70" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <div className="max-w-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-20 h-20 flex items-center justify-center">
                <img
                  src="/logo-white.png"
                  alt="CMRAS Logo"
                  className="w-20 h-20 object-contain"
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">CMRAS</h1>
                <p className="text-blue-100 text-sm">Child Malnutrition Risk Assessment</p>
              </div>
            </div>

            <h2 className="text-4xl font-bold mb-4 leading-tight">
              {CONTENT_VARIATIONS[currentImageIndex].headline}
            </h2>

            <p className="text-lg text-blue-50 mb-8">
              {CONTENT_VARIATIONS[currentImageIndex].description}
            </p>

            {/* Features */}
            <div className="space-y-4">
              {CONTENT_VARIATIONS[currentImageIndex].features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white mb-1">{feature.title}</h3>
                    <p className="text-sm text-blue-100">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="relative z-10 w-full lg:w-2/5 flex items-center justify-center bg-transparent p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-8 lg:p-10">
            {/* Header */}
            <div className="mb-8 text-center">
              <div className="inline-flex lg:hidden items-center justify-center w-16 h-16 mb-4">
                <img
                  src="/Logo.png"
                  alt="CMRAS Logo"
                  className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 object-contain"
                />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
              <p className="text-gray-600">Sign in to access the CMRAS portal</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-900 mb-2">
                  Username
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Enter username"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-900 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Enter password"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border-2 border-red-300 text-red-900 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
              >
                Sign In
              </button>
            </form>

            <div className="mt-6 text-center text-xs text-gray-500">
              <p>For authorized health workers only</p>
              <p className="mt-1">Contact system administrator for access</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}