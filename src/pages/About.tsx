export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-50 to-cyan-100 py-16 px-6">
      <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow-xl p-10">

        <h1 className="text-5xl font-bold text-center text-blue-700 mb-8">
          🩺 About VitalScan AI
        </h1>

        <p className="text-lg text-gray-700 text-center leading-8">
          VitalScan AI is an intelligent healthcare screening application
          designed to provide a quick overview of a user's health. By combining
          AI-powered analysis with basic health information, the system helps
          users understand their overall health condition in just a few seconds.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mt-12">

          <div className="bg-blue-100 rounded-2xl p-6 shadow">
            <h2 className="text-2xl font-bold text-blue-700 mb-4">
              🎯 Our Mission
            </h2>

            <p className="text-gray-700 leading-7">
              Our mission is to make health screening simple, fast, and
              accessible. VitalScan AI provides users with a preliminary health
              assessment that encourages awareness and supports healthier
              lifestyle choices.
            </p>
          </div>

          <div className="bg-green-100 rounded-2xl p-6 shadow">
            <h2 className="text-2xl font-bold text-green-700 mb-4">
              🚀 Key Features
            </h2>

            <ul className="space-y-2 text-gray-700">
              <li>✅ AI-Based Health Screening</li>
              <li>✅ Live Camera Scan</li>
              <li>✅ Heart Rate Monitoring</li>
              <li>✅ Blood Pressure Estimation</li>
              <li>✅ Oxygen Level Analysis</li>
              <li>✅ Stress Level Assessment</li>
              <li>✅ Health Dashboard</li>
              <li>✅ AI Health Report</li>
            </ul>
          </div>

        </div>

        <div className="bg-purple-100 rounded-2xl p-6 shadow mt-10">
          <h2 className="text-2xl font-bold text-purple-700 mb-4">
            💙 Why Choose VitalScan AI?
          </h2>

          <ul className="space-y-3 text-gray-700">
            <li>✔️ Fast and easy health screening</li>
            <li>✔️ User-friendly interface</li>
            <li>✔️ Instant AI-generated health report</li>
            <li>✔️ Clear health dashboard and insights</li>
            <li>✔️ Helps users monitor their health regularly</li>
          </ul>
        </div>

        <div className="bg-yellow-100 rounded-2xl p-6 shadow mt-10">
          <h2 className="text-2xl font-bold text-yellow-700 mb-4">
            ⚠️ Disclaimer
          </h2>

          <p className="text-gray-700 leading-7">
            VitalScan AI is intended for educational and preliminary health
            assessment purposes only. It is not a substitute for professional
            medical advice, diagnosis, or treatment. Always consult a qualified
            healthcare professional regarding any medical concerns.
          </p>
        </div>

      </div>
    </div>
  );
}