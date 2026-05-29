'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SubscriptionsPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [currentPlan, setCurrentPlan] = useState<'free' | 'pro' | 'team'>('free');

    useEffect(() => {
        // Simulate loading
        setIsLoading(false);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p>Loading...</p>
            </div>
        );
    }

    const plans = [
        {
            id: 'free',
            name: 'Free',
            price: '$0',
            period: '/month',
            description: 'Perfect for personal projects',
            features: [
                'Up to 5 whiteboards',
                'Basic drawing tools',
                'Real-time collaboration (2 users)',
                'Cloud storage (100MB)',
            ],
        },
        {
            id: 'pro',
            name: 'Pro',
            price: '$9.99',
            period: '/month',
            description: 'For individual creators',
            features: [
                'Unlimited whiteboards',
                'Advanced drawing tools',
                'Real-time collaboration (10 users)',
                'Cloud storage (10GB)',
                'AI-powered features',
                'Export to image/PDF',
            ],
        },
        {
            id: 'team',
            name: 'Team',
            price: '$29.99',
            period: '/month',
            description: 'For teams and organizations',
            features: [
                'Everything in Pro',
                'Team management',
                'Real-time collaboration (unlimited users)',
                'Cloud storage (100GB)',
                'Priority support',
                'Advanced permissions',
                'Activity logs',
            ],
        },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto p-8">
                {/* Header */}
                <div className="mb-12">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 transition"
                    >
                        <ChevronLeft size={20} />
                        Back
                    </button>
                    <h1 className="text-3xl font-bold text-gray-800">Subscriptions</h1>
                    <p className="text-gray-600 mt-2">Choose a plan that works for you</p>
                </div>

                {/* Plans Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {plans.map((plan) => (
                        <div
                            key={plan.id}
                            className={`rounded-lg border-2 p-6 transition ${currentPlan === plan.id
                                    ? 'border-blue-600 bg-blue-50'
                                    : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                        >
                            {currentPlan === plan.id && (
                                <div className="inline-block bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
                                    Current Plan
                                </div>
                            )}

                            <h3 className="text-2xl font-bold text-gray-800 mb-2">{plan.name}</h3>
                            <p className="text-gray-600 text-sm mb-4">{plan.description}</p>

                            <div className="mb-6">
                                <span className="text-4xl font-bold text-gray-800">{plan.price}</span>
                                <span className="text-gray-600">{plan.period}</span>
                            </div>

                            <button
                                className={`w-full py-2 rounded-lg font-medium transition mb-6 ${currentPlan === plan.id
                                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                disabled={currentPlan === plan.id}
                            >
                                {currentPlan === plan.id ? 'Current Plan' : 'Upgrade'}
                            </button>

                            <ul className="space-y-3">
                                {plan.features.map((feature, idx) => (
                                    <li key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                                        <Check size={16} className="text-green-600 flex-shrink-0" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Billing Info */}
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">Billing Information</h2>
                    <div className="space-y-2 text-sm text-gray-600">
                        <p>
                            <span className="font-medium">Next billing date:</span> January 24, 2026
                        </p>
                        <p>
                            <span className="font-medium">Payment method:</span> Visa ending in 4242
                        </p>
                    </div>
                    <button className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium">
                        Update payment method
                    </button>
                </div>
            </div>
        </div>
    );
}
