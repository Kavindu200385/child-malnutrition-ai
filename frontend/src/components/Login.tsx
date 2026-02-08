import { useState, useEffect } from 'react';
import { User, UserRole } from '../App';
import { Lock, User as UserIcon, Shield, Heart, Users, Activity } from 'lucide-react';

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

// Mock user database - Updated with new role system
const MOCK_USERS: Record<string, { password: string; user: User }> = {
  // Admin users
  'admin': {
    password: 'admin123',
    user: {
      id: 'admin001',
      username: 'admin',
      name: 'System Administrator',
      role: 'admin',
    },
  },
  'admin2': {
    password: 'admin123',
    user: {
      id: 'admin002',
      username: 'admin2',
      name: 'Dr. Priyanka Wickramasinghe',
      role: 'admin',
      clinic: 'National Health Office',
      district: 'Colombo',
    },
  },
  // Midwife users
  'midwife1': {
    password: 'midwife123',
    user: {
      id: 'midwife001',
      username: 'midwife1',
      name: 'Kamani Perera',
      role: 'health_worker',
      clinic: 'Colombo PHM Clinic',
      district: 'Colombo',
    },
  },
  'midwife2': {
    password: 'midwife123',
    user: {
      id: 'midwife002',
      username: 'midwife2',
      name: 'Nadeesha Silva',
      role: 'health_worker',
      clinic: 'Gampaha MOH Office',
      district: 'Gampaha',
    },
  },
  'midwife3': {
    password: 'midwife123',
    user: {
      id: 'midwife003',
      username: 'midwife3',
      name: 'Sanduni Fernando',
      role: 'health_worker',
      clinic: 'Kandy Health Center',
      district: 'Kandy',
    },
  },
  // MOH Doctor users
  'moh.doctor1': {
    password: 'moh123',
    user: {
      id: 'moh001',
      username: 'moh.doctor1',
      name: 'Dr. Nimal Perera',
      role: 'health_worker',
      clinic: 'Colombo PHM Clinic',
      district: 'Colombo',
    },
  },
  'moh.doctor2': {
    password: 'moh123',
    user: {
      id: 'moh002',
      username: 'moh.doctor2',
      name: 'Dr. Kasun Fernando',
      role: 'health_worker',
      clinic: 'Gampaha MOH Office',
      district: 'Gampaha',
    },
  },
  'moh.doctor3': {
    password: 'moh123',
    user: {
      id: 'moh003',
      username: 'moh.doctor3',
      name: 'Dr. Malini Rajapakse',
      role: 'health_worker',
      clinic: 'Kandy Health Center',
      district: 'Kandy',
    },
  },
  // Nutritionist users
  'nutritionist1': {
    password: 'nutrition123',
    user: {
      id: 'nutrition001',
      username: 'nutritionist1',
      name: 'Tharushi Jayasuriya',
      role: 'health_worker',
      clinic: 'Colombo PHM Clinic',
      district: 'Colombo',
    },
  },
  'nutritionist2': {
    password: 'nutrition123',
    user: {
      id: 'nutrition002',
      username: 'nutritionist2',
      name: 'Dilini Perera',
      role: 'health_worker',
      clinic: 'Gampaha MOH Office',
      district: 'Gampaha',
    },
  },
  'nutritionist3': {
    password: 'nutrition123',
    user: {
      id: 'nutrition003',
      username: 'nutritionist3',
      name: 'Chamari Silva',
      role: 'health_worker',
      clinic: 'Kandy Health Center',
      district: 'Kandy',
    },
  },
};

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Shuffle background images every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % BACKGROUND_IMAGES.length);
    }, 5000); // Change image every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const userEntry = MOCK_USERS[username];
    if (!userEntry) {
      setError('Invalid username or password');
      return;
    }

    if (userEntry.password !== password) {
      setError('Invalid username or password');
      return;
    }

    onLogin(userEntry.user);
  };

  const fillCredentials = (userKey: string) => {
    const userEntry = MOCK_USERS[userKey];
    if (userEntry) {
      setUsername(userKey);
      setPassword(userEntry.password);
      setError('');
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
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
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-white/40">
                <Shield className="w-8 h-8 text-white" />
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
      <div className="w-full lg:w-2/5 flex items-center justify-center bg-gray-50 p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-8 lg:p-10">
            {/* Header */}
            <div className="mb-8">
              <div className="lg:hidden inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
                <Shield className="w-8 h-8 text-white" />
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

            {/* Demo Credentials */}
            <div className="mt-6 pt-6 border-t-2 border-gray-200">
              <p className="text-sm font-semibold text-gray-900 mb-3">Demo Credentials (Temporary):</p>
              <div className="text-xs text-gray-700 space-y-3 bg-gradient-to-br from-blue-50 to-green-50 rounded-lg p-4 border-2 border-blue-200 max-h-96 overflow-y-auto">
                <div>
                  <strong className="text-gray-900 block mb-1">👑 Admin:</strong>
                  <div className="ml-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => fillCredentials('admin')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">admin</span> / <span className="font-mono">admin123</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials('admin2')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">admin2</span> / <span className="font-mono">admin123</span>
                    </button>
                  </div>
                </div>
                <div>
                  <strong className="text-gray-900 block mb-1">👩‍⚕️ Midwife:</strong>
                  <div className="ml-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => fillCredentials('midwife1')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">midwife1</span> / <span className="font-mono">midwife123</span> (Colombo)
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials('midwife2')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">midwife2</span> / <span className="font-mono">midwife123</span> (Gampaha)
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials('midwife3')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">midwife3</span> / <span className="font-mono">midwife123</span> (Kandy)
                    </button>
                  </div>
                </div>
                <div>
                  <strong className="text-gray-900 block mb-1">👨‍⚕️ MOH Doctor:</strong>
                  <div className="ml-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => fillCredentials('moh.doctor1')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">moh.doctor1</span> / <span className="font-mono">moh123</span> (Colombo)
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials('moh.doctor2')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">moh.doctor2</span> / <span className="font-mono">moh123</span> (Gampaha)
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials('moh.doctor3')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">moh.doctor3</span> / <span className="font-mono">moh123</span> (Kandy)
                    </button>
                  </div>
                </div>
                <div>
                  <strong className="text-gray-900 block mb-1">🥗 Nutritionist:</strong>
                  <div className="ml-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => fillCredentials('nutritionist1')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">nutritionist1</span> / <span className="font-mono">nutrition123</span> (Colombo)
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials('nutritionist2')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">nutritionist2</span> / <span className="font-mono">nutrition123</span> (Gampaha)
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials('nutritionist3')}
                      className="block w-full text-left hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">nutritionist3</span> / <span className="font-mono">nutrition123</span> (Kandy)
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2 italic">💡 Click on any credential above to auto-fill the form</p>
            </div>

            <div className="mt-6 text-center text-xs text-gray-500">
              <p>For authorized health workers only</p>
              <p className="mt-1">Contact system administrator for access</p>
            </div>
          </div>
          
          {/* Mobile Ministry Info */}
          <div className="lg:hidden mt-6 text-center">
            <p className="text-sm text-gray-600">Ministry of Health - Sri Lanka</p>
            <p className="text-xs text-gray-500 mt-1">PHM / MOH Clinic Portal</p>
          </div>
        </div>
      </div>
    </div>
  );
}