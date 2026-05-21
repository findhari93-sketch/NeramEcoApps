import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateOrganizationSchema,
  generateCourseSchema,
  generateBreadcrumbSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';

/**
 * Native Hindi landing page for NATA online coaching.
 * Serves /hi/nata-online-coaching with mostly-Hindi content
 * so Google indexes it as a genuine Hindi page rather than
 * a duplicate of the English canonical.
 */
export default function NataOnlineCoachingHindi() {
  const pageUrl = `${BASE_URL}/hi/nata-online-coaching`;

  const faqs = [
    {
      question: 'NATA ऑनलाइन कोचिंग क्या है?',
      answer:
        'NATA (National Aptitude Test in Architecture) ऑनलाइन कोचिंग वह संरचित तैयारी कक्षा है जिसमें अनुभवी वास्तुकला शिक्षक वीडियो के माध्यम से लाइव पढ़ाते हैं। नेरम क्लासेस (Neram Classes) NIT, IIT, SPA पूर्व छात्रों को शिक्षक के रूप में रखता है, प्रत्येक बैच में अधिकतम 25 छात्र, दैनिक ड्रॉइंग अभ्यास, और 99.9% सफलता दर के साथ 2009 से यह सेवा प्रदान कर रहा है।',
    },
    {
      question: 'NATA ऑनलाइन कोचिंग की फीस कितनी है?',
      answer:
        'नेरम क्लासेस में NATA ऑनलाइन कोचिंग की फीस 3-महीने के क्रैश कोर्स के लिए रु. 15,000 से शुरू होती है, 1-वर्ष के कार्यक्रम के लिए रु. 25,000, और 2-वर्ष के कार्यक्रम के लिए रु. 30,000। EMI विकल्प और जरूरत-आधारित छात्रवृत्ति भी उपलब्ध हैं।',
    },
    {
      question: 'क्या मैं अपने शहर से NATA ऑनलाइन कोचिंग ले सकता हूँ?',
      answer:
        'हाँ। दिल्ली NCR, मुंबई, बैंगलोर, हैदराबाद, अहमदाबाद, कोलकाता, पुणे, कोची सहित भारत के 150+ शहरों के छात्र नेरम क्लासेस ऑनलाइन कक्षाओं में शामिल हो सकते हैं। आपको केवल एक स्थिर इंटरनेट कनेक्शन और लैपटॉप या टैबलेट की आवश्यकता है।',
    },
    {
      question: 'NATA परीक्षा पैटर्न 2026 कैसा है?',
      answer:
        'NATA 2026 ऑनलाइन आयोजित होगा। 3 घंटे में कुल 125 प्रश्न, 200 अंकों के लिए। तीन खंड हैं: Diagrammatic Reasoning, Numerical & Verbal Reasoning, और Inductive & Situational Reasoning (ड्रॉइंग सहित)। कोई नकारात्मक अंकन नहीं है।',
    },
    {
      question: 'क्या नेरम क्लासेस हिंदी में पढ़ाई जाती है?',
      answer:
        'हाँ। नेरम क्लासेस NATA कोचिंग 5 भाषाओं में प्रदान करता है: अंग्रेजी, तमिल, हिंदी, कन्नड़, मलयालम। हिंदी माध्यम के छात्र नामांकन के समय अपनी पसंदीदा भाषा बैच चुन सकते हैं।',
    },
    {
      question: 'क्या ये लाइव कक्षाएँ हैं या रिकॉर्ड किए गए वीडियो?',
      answer:
        'नेरम क्लासेस पूरी तरह से लाइव इंटरैक्टिव सत्र आयोजित करता है। आप प्रश्न पूछ सकते हैं, तत्काल प्रतिक्रिया प्राप्त कर सकते हैं, और सीधे शिक्षक को अपनी ड्रॉइंग दिखा सकते हैं। सभी लाइव सत्र पुनरीक्षण के लिए रिकॉर्ड भी किए जाते हैं।',
    },
    {
      question: 'NATA के बाद कौन-से वास्तुकला कॉलेजों में दाखिला मिल सकता है?',
      answer:
        'SPA Delhi, NIT Trichy, NIT Calicut, CEPT Ahmedabad, JJ Mumbai, Anna University Chennai, JNAFAU Hyderabad, BMS Bangalore जैसे शीर्ष वास्तुकला कॉलेजों में प्रवेश संभव है। आपके NATA स्कोर के लिए सटीक प्रवेश संभावना हमारे मुफ्त कॉलेज प्रेडिक्टर टूल से देख सकते हैं।',
    },
  ];

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd
        data={{
          ...generateCourseSchema({
            name: 'NATA ऑनलाइन कोचिंग 2026: लाइव कक्षाएँ, NIT/IIT शिक्षक',
            description:
              'भारत की सबसे विश्वसनीय NATA ऑनलाइन कोचिंग। NIT, IIT, SPA पूर्व छात्र शिक्षक, दैनिक ड्रॉइंग अभ्यास, 100+ मॉक टेस्ट, 99.9% सफलता दर, 2009 से।',
            url: pageUrl,
            modes: ['online'],
            price: 15000,
          }),
          inLanguage: 'hi',
        }}
      />
      <JsonLd data={{ ...generateFAQSchema(faqs), inLanguage: 'hi' }} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'मुख्य पृष्ठ', url: `${BASE_URL}/hi` },
          { name: 'NATA ऑनलाइन कोचिंग' },
        ])}
      />

      <Box lang="hi">
        {/* Hero */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
            color: 'white',
          }}
        >
          <Container maxWidth="lg">
            <Chip
              label="NATA 2026: लाइव ऑनलाइन कोचिंग"
              sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }}
            />
            <Typography
              variant="h1"
              component="h1"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' }, lineHeight: 1.3 }}
            >
              NATA ऑनलाइन कोचिंग 2026
            </Typography>
            <Typography variant="h5" sx={{ mb: 4, opacity: 0.92, lineHeight: 1.7, maxWidth: 820 }}>
              वास्तुकला छात्रों के लिए लाइव कक्षाएँ। NIT, IIT, SPA पूर्व छात्र शिक्षक।
              99.9% सफलता दर, प्रत्येक बैच में अधिकतम 25 छात्र, दैनिक ड्रॉइंग अभ्यास।
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/hi/demo-class"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                मुफ्त डेमो कक्षा
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/hi/apply"
                sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                अभी नामांकन करें
              </Button>
            </Stack>
          </Container>
        </Box>

        {/* AEO answer block in Hindi */}
        <Box sx={{ py: { xs: 5, md: 7 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.6rem', md: '2rem' } }}
            >
              NATA ऑनलाइन कोचिंग क्या है?
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.9, color: 'text.secondary', fontSize: '1.05rem', mb: 3 }}>
              NATA (National Aptitude Test in Architecture) ऑनलाइन कोचिंग वह संरचित तैयारी है जो
              अनुभवी वास्तुकला शिक्षकों द्वारा वीडियो के माध्यम से लाइव कक्षाओं में दी जाती है।
              इसमें गणित, सामान्य अभिक्षमता, और ड्रॉइंग परीक्षण ये तीनों खंड शामिल होते हैं।
              साप्ताहिक मॉक टेस्ट, ड्रॉइंग पर एक-पर-एक प्रतिक्रिया, और दैनिक स्केचिंग अभ्यास भी
              मिलता है।
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.9, color: 'text.secondary', fontSize: '1.05rem' }}>
              नेरम क्लासेस (Neram Classes) में NIT, IIT, SPA पूर्व छात्र शिक्षक 25 छात्रों के छोटे बैच में
              पढ़ाते हैं। 2009 से 10,000 से अधिक छात्रों को प्रशिक्षित कर चुके हैं, 99.9% सफलता दर
              के साथ भारत के 150+ शहरों और 6 खाड़ी देशों के छात्रों को सेवा देते हैं।
            </Typography>
          </Container>
        </Box>

        {/* Why us, in Hindi */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 5 }}>
              हिंदी भाषी छात्र नेरम क्लासेस क्यों चुनते हैं
            </Typography>
            <Grid container spacing={3}>
              {[
                { title: 'लाइव कक्षाएँ', body: 'रिकॉर्ड किए गए वीडियो नहीं, वास्तविक लाइव कक्षाएँ। प्रश्न पूछें और तत्काल प्रतिक्रिया प्राप्त करें।' },
                { title: 'NIT, IIT, SPA शिक्षक', body: 'सभी शिक्षक NIT, IIT या SPA के पूर्व छात्र हैं। 10+ वर्षों का शिक्षण अनुभव।' },
                { title: 'छोटा बैच (अधिकतम 25)', body: 'प्रत्येक बैच में 25 से अधिक छात्र नहीं। हर छात्र को व्यक्तिगत ध्यान।' },
                { title: 'दैनिक ड्रॉइंग अभ्यास', body: 'प्रतिदिन 2 घंटे की पर्यवेक्षित ड्रॉइंग अभ्यास, शिक्षक की लाइव प्रतिक्रिया और विस्तृत मूल्यांकन।' },
                { title: '100+ मॉक टेस्ट', body: 'विस्तृत प्रदर्शन विश्लेषण, खंडवार स्कोरिंग, और सुधार सुझावों के साथ।' },
                { title: 'हिंदी में पढ़ाया जाता है', body: 'अंग्रेजी, तमिल, हिंदी, कन्नड़, मलयालम 5 भाषाओं में उपलब्ध। अपनी पसंद से चुनें।' },
              ].map((item) => (
                <Grid item xs={12} sm={6} md={4} key={item.title}>
                  <Card sx={{ height: '100%', p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                      {item.body}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Fees in Hindi */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA ऑनलाइन कोचिंग शुल्क विवरण
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 5, maxWidth: 720, mx: 'auto' }}>
              पूरे भारत में एक समान शुल्क। EMI और छात्रवृत्ति विकल्प उपलब्ध।
            </Typography>
            <Grid container spacing={3} justifyContent="center">
              {[
                { name: 'NATA क्रैश कोर्स', dur: '3 महीने', price: '15,000' },
                { name: '1-वर्षीय NATA कार्यक्रम', dur: '12 महीने', price: '25,000', highlight: true },
                { name: '2-वर्षीय NATA + JEE Paper 2', dur: '24 महीने', price: '30,000' },
              ].map((course) => (
                <Grid item xs={12} md={4} key={course.name}>
                  <Card
                    sx={{
                      height: '100%',
                      p: 3,
                      border: course.highlight ? '2px solid' : '1px solid',
                      borderColor: course.highlight ? 'primary.main' : 'grey.300',
                    }}
                  >
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                      {course.name}
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>
                      रु. {course.price}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      अवधि: {course.dur} (EMI उपलब्ध)
                    </Typography>
                    <Button
                      variant={course.highlight ? 'contained' : 'outlined'}
                      fullWidth
                      component={Link}
                      href="/hi/apply"
                      sx={{ fontWeight: 600, minHeight: 48 }}
                    >
                      अभी नामांकन करें
                    </Button>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* FAQ in Hindi */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 5 }}>
              अक्सर पूछे जाने वाले प्रश्न
            </Typography>
            {faqs.map((faq) => (
              <Accordion
                key={faq.question}
                disableGutters
                sx={{
                  '&:before': { display: 'none' },
                  mb: 1,
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary
                  expandIcon={<Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>}
                  sx={{ bgcolor: 'white', minHeight: 48 }}
                >
                  <Typography sx={{ fontWeight: 600 }}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white' }}>
                  <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.9 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* CTA */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            pb: { xs: 14, md: 12 },
            background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
            color: 'white',
            textAlign: 'center',
          }}
        >
          <Container maxWidth="md">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
              अपनी NATA यात्रा आज ही शुरू करें
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.7 }}>
              प्रत्येक बैच में अधिकतम 25 छात्र। अभी अपनी सीट सुरक्षित करें।
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/hi/apply"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                अभी नामांकन करें
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/hi/demo-class"
                sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                मुफ्त डेमो
              </Button>
            </Stack>
          </Container>
        </Box>
      </Box>
    </>
  );
}
